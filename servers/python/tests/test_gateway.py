"""Batería §9.3/§9.4/§9.7 del modo delegado del gateway (F1.5):

- aserción: firma, aud, exp<=60s, jti un solo uso → replay 401;
- token de servicio sin aserción → 401;
- escrituras por MCP crean Proposal y devuelven ProposalRef (sin ejecutar);
- apply por elicitation solo con cliente verificado + org activada +
  reversible con card + accept; el resto → review_url sin ejecutar;
- get/apply/revert anti-IDOR → 404; review_url sin token;
- accept de otro user/org → 403 (lo cubre el servicio).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from gruia_agent_tools import (
    ContractError,
    DelegatedGateway,
    issue_test_assertion,
)
from gruia_agent_tools.contract import validate_document

from .conftest import APP, ORG, OTHER_ORG, USER, make_entitlement

SVC = "svc-channel-token"
CLIENT = "cli-mcp-1"
MCP_WRITE = f"{APP}__memoria__recordar"
SYS_APPLY = f"{APP}__proposal__apply"
SYS_REVERT = f"{APP}__proposal__revert"
SYS_GET = f"{APP}__proposal__get"


@pytest.fixture(scope="module")
def keypair():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return private, public_pem


@pytest.fixture
def gateway(service, keypair):
    _, public_pem = keypair
    return DelegatedGateway(
        service,
        app_key=APP,
        jwks_resolver=lambda kid: public_pem,
        service_token_verifier=lambda t: t == SVC,
        verified_clients={CLIENT},
        review_url_template="https://app.example/agent/proposals/{proposal_id}",
        elicit=lambda p: "accept",
    )


def _assertion(keypair, org=ORG, user=USER, scopes=None, lifetime=60, **kw):
    private, _ = keypair
    return issue_test_assertion(
        private_key=private,
        app_key=APP,
        sub=user,
        org=org,
        scopes=scopes if scopes is not None else [f"app:{APP}", "tool:*"],
        lifetime_s=lifetime,
        **kw,
    )


def _entitlement(**extra):
    row = {
        "enabled": True,
        "tools_allow": ["*"],
        "max_effect": "irreversible",
        "mcp_access": True,
        "elicitation_apply": True,
        "cost_threshold": {},
    }
    row.update(extra)
    return row


@pytest.fixture
def mcp_service(service):
    service.entitlement = make_entitlement(
        tools_allow=["*"], max_effect="irreversible"
    )
    service.entitlement._rows[(ORG, APP)] = _entitlement()
    return service


def _err(fn, *args, **kw):
    with pytest.raises(ContractError) as ei:
        fn(*args, **kw)
    return ei.value


# ------------------------------------------------------------- aserción


def test_service_token_without_assertion_is_401(mcp_service, gateway, keypair):
    err = _err(gateway.call_tool, MCP_WRITE, {"fact": "x"}, assertion=None, service_token=SVC)
    assert err.status == 401
    assert err.code == "assertion_required"


def test_missing_service_token_is_401(mcp_service, gateway, keypair):
    err = _err(
        gateway.call_tool, MCP_WRITE, {"fact": "x"},
        assertion=_assertion(keypair), service_token=None,
    )
    assert err.status == 401
    assert err.code == "invalid_service_token"


def test_wrong_audience_is_401(mcp_service, gateway, keypair):
    private, _ = keypair
    assertion = issue_test_assertion(
        private_key=private, app_key="otra_app", sub=USER, org=ORG,
        scopes=[f"app:otra_app", "tool:*"],
    )
    err = _err(gateway.call_tool, MCP_WRITE, {"fact": "x"}, assertion=assertion, service_token=SVC)
    assert err.status == 401
    assert err.code == "invalid_assertion"


def test_bad_signature_is_401(mcp_service, gateway, keypair):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assertion = issue_test_assertion(
        private_key=other, app_key=APP, sub=USER, org=ORG, scopes=[f"app:{APP}", "tool:*"]
    )
    err = _err(gateway.call_tool, MCP_WRITE, {"fact": "x"}, assertion=assertion, service_token=SVC)
    assert err.status == 401


def test_assertion_lifetime_over_60s_is_401(mcp_service, gateway, keypair):
    err = _err(
        gateway.call_tool, MCP_WRITE, {"fact": "x"},
        assertion=_assertion(keypair, lifetime=61), service_token=SVC,
    )
    assert err.status == 401


def test_expired_assertion_is_401(mcp_service, gateway, keypair):
    past = datetime.now(timezone.utc) - timedelta(seconds=120)
    assertion = _assertion(keypair, now=past)
    err = _err(
        gateway.call_tool, MCP_WRITE, {"fact": "x"},
        assertion=assertion, service_token=SVC, now=past + timedelta(seconds=100),
    )
    assert err.status == 401


def test_replayed_jti_is_401(mcp_service, gateway, keypair):
    assertion = _assertion(keypair, jti=str(uuid.uuid4()))
    gateway.call_tool(MCP_WRITE, {"fact": "x"}, assertion=assertion, service_token=SVC)
    err = _err(
        gateway.call_tool, MCP_WRITE, {"fact": "y"}, assertion=assertion, service_token=SVC
    )
    assert err.status == 401
    assert err.code == "assertion_replayed"


def test_missing_scope_is_403(mcp_service, gateway, keypair):
    err = _err(
        gateway.call_tool, MCP_WRITE, {"fact": "x"},
        assertion=_assertion(keypair, scopes=[f"app:{APP}", "tool:otra.cosa"]),
        service_token=SVC,
    )
    assert err.status == 403
    assert err.code == "scope_denied"


def test_missing_mcp_access_is_403(mcp_service, gateway, keypair):
    mcp_service.entitlement._rows[(ORG, APP)] = _entitlement(mcp_access=False)
    err = _err(
        gateway.call_tool, MCP_WRITE, {"fact": "x"},
        assertion=_assertion(keypair), service_token=SVC,
    )
    assert err.status == 403
    assert err.code == "mcp_access_denied"


# ----------------------------------------------------- escrituras → ref


def test_write_tool_creates_proposal_and_returns_ref(mcp_service, gateway, keypair, reversible_tool):
    result = gateway.call_tool(
        MCP_WRITE, {"fact": "dato"}, assertion=_assertion(keypair), service_token=SVC
    )
    ref = result["structuredContent"]
    assert validate_document("proposal-ref", ref) == []
    proposal = mcp_service.storage.get_proposal(ref["proposal_id"])
    assert proposal["state"] == "proposed"
    assert proposal["user_id"] == USER
    assert reversible_tool.applied == []  # §9.2: nunca aplica
    assert "token" not in ref["review_url"]
    assert ref["proposal_id"] in ref["review_url"]


def test_proposal_ref_review_url_has_no_token(mcp_service, gateway, keypair):
    result = gateway.call_tool(
        MCP_WRITE, {"fact": "dato"}, assertion=_assertion(keypair), service_token=SVC
    )
    url = result["structuredContent"]["review_url"]
    assert "token" not in url and "apply" not in url.split("?")[-1]


# -------------------------------------------------------------- apply


def _propose_via_mcp(mcp_service, gateway, keypair, tool=MCP_WRITE, arguments=None):
    ref = gateway.call_tool(
        tool, arguments or {"fact": "x"}, assertion=_assertion(keypair), service_token=SVC
    )["structuredContent"]
    return ref["proposal_id"]


def test_apply_by_elicitation_executes(mcp_service, gateway, keypair, reversible_tool):
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    result = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    assert result["change_id"]
    proposal = mcp_service.storage.get_proposal(pid)
    assert proposal["state"] == "applied"
    audit = [e for e in mcp_service.drainer._sink.events if e["action"] == "applied"]
    assert audit and audit[-1]["via"] == "mcp"
    assert audit[-1]["client_id"] == CLIENT
    assert audit[-1]["client_verified"] is True
    assert audit[-1]["confirm_channel"] == "elicitation"


def test_apply_returns_review_url_when_elicit_declines(mcp_service, gateway, keypair, reversible_tool):
    gateway._elicit = lambda p: "decline"
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    result = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    assert "review_url" in result
    assert reversible_tool.applied == []
    assert mcp_service.storage.get_proposal(pid)["state"] == "proposed"


def test_apply_returns_review_url_for_unverified_client(mcp_service, gateway, keypair, reversible_tool):
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    result = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid},
        assertion=_assertion(keypair, client_id="cli-nuevo", client_verified=False),
        service_token=SVC,
    )
    assert "review_url" in result
    assert reversible_tool.applied == []


def test_apply_returns_review_url_when_org_disabled(mcp_service, gateway, keypair, reversible_tool):
    mcp_service.entitlement._rows[(ORG, APP)] = _entitlement(elicitation_apply=False)
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    result = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    assert "review_url" in result
    assert reversible_tool.applied == []


def test_apply_strong_confirmation_returns_review_url(mcp_service, gateway, keypair, reversible_tool):
    # fuerza escalado card→strong con umbral por debajo del coste
    mcp_service.entitlement._rows[(ORG, APP)] = _entitlement(
        elicitation_apply=True, cost_threshold={"credits": 1}
    )
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    proposal = mcp_service.storage.get_proposal(pid)
    assert proposal["confirm_effective"] == "strong"
    result = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    assert "review_url" in result
    assert reversible_tool.applied == []


def test_apply_irreversible_returns_review_url(mcp_service, gateway, keypair, irreversible_tool):
    pid = _propose_via_mcp(
        mcp_service, gateway, keypair,
        tool=f"{APP}__crm__borrar_cuenta", arguments={"account": "acc-1"},
    )
    result = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    assert "review_url" in result
    assert irreversible_tool.applied == []


# ---------------------------------------------------------------- get


def test_get_returns_proposal(mcp_service, gateway, keypair):
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    result = gateway.call_tool(
        SYS_GET, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    assert result["proposal"]["id"] == pid


def test_get_other_org_is_404(mcp_service, gateway, keypair):
    mcp_service.entitlement._rows[(OTHER_ORG, APP)] = _entitlement()
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    err = _err(
        gateway.call_tool, SYS_GET, {"proposal_id": pid},
        assertion=_assertion(keypair, org=OTHER_ORG, scopes=[f"app:{APP}", "tool:*"]),
        service_token=SVC,
    )
    assert err.status == 404


def test_apply_other_user_is_404(mcp_service, gateway, keypair):
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    err = _err(
        gateway.call_tool, SYS_APPLY, {"proposal_id": pid},
        assertion=_assertion(keypair, user="user-2"), service_token=SVC,
    )
    assert err.status == 404


def test_get_unknown_proposal_is_404(mcp_service, gateway, keypair):
    err = _err(
        gateway.call_tool, SYS_GET, {"proposal_id": str(uuid.uuid4())},
        assertion=_assertion(keypair), service_token=SVC,
    )
    assert err.status == 404


# ------------------------------------------------------------- revert


def test_revert_by_elicitation_executes(mcp_service, gateway, keypair, reversible_tool):
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    applied = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    result = gateway.call_tool(
        SYS_REVERT, {"change_id": applied["change_id"]},
        assertion=_assertion(keypair), service_token=SVC,
    )
    assert result["change"]["state"] == "reverted"
    assert reversible_tool.reverted == [applied["change_id"]]


def test_revert_other_user_is_404(mcp_service, gateway, keypair):
    pid = _propose_via_mcp(mcp_service, gateway, keypair)
    applied = gateway.call_tool(
        SYS_APPLY, {"proposal_id": pid}, assertion=_assertion(keypair), service_token=SVC
    )
    err = _err(
        gateway.call_tool, SYS_REVERT, {"change_id": applied["change_id"]},
        assertion=_assertion(keypair, user="user-2"), service_token=SVC,
    )
    assert err.status == 404


def test_unknown_mcp_name_is_400(mcp_service, gateway, keypair):
    err = _err(
        gateway.call_tool, f"{APP}__inexistente__verb", {},
        assertion=_assertion(keypair), service_token=SVC,
    )
    assert err.status == 400
    assert err.code == "unknown_tool"
