"""Batería de tokens §7: un solo uso, ligados a proposal+payload+actor,
TTL <= 120 s, CAS en concurrencia, 409 por coste, fail-closed."""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

import pytest

from gruia_agent_tools import ContractError, StubEntitlement, tokens
from gruia_agent_tools.entitlement import HttpEntitlementChecker

from .conftest import APP, ORG, OTHER_ORG, USER, accept, apply_, make_entitlement, propose


class Denied(Exception):
    pass


def _err(fn, *args, **kw):
    with pytest.raises(ContractError) as ei:
        fn(*args, **kw)
    return ei.value


def test_apply_happy_path(service, sink):
    p = propose(service)
    token = accept(service, p["id"])
    result = apply_(service, p["id"], token)
    assert result["change_id"]
    assert result["proposal"]["state"] == "applied"
    assert result["proposal"]["change_id"] == result["change_id"]


def test_double_apply_same_token_returns_same_change(service):
    p = propose(service)
    token = accept(service, p["id"])
    first = apply_(service, p["id"], token)
    second = apply_(service, p["id"], token)
    assert second["change_id"] == first["change_id"]


def test_concurrent_applies_one_wins_one_denied(service, storage):
    """Dos apply concurrentes con el mismo token: 200 + 403 (CAS)."""
    p = propose(service)
    token = accept(service, p["id"])
    results, errors = [], []

    barrier = threading.Barrier(2)

    def run():
        try:
            barrier.wait()
            results.append(apply_(service, p["id"], token))
        except ContractError as e:
            errors.append(e)

    t1, t2 = threading.Thread(target=run), threading.Thread(target=run)
    t1.start(); t2.start(); t1.join(); t2.join()

    assert len(results) + len(errors) == 2
    # Uno gana; el otro ve token consumido → 200 idempotente o 403 de carrera.
    # El invariante de §4: exactamente un efecto aplicado.
    change_ids = [r["change_id"] for r in results if r.get("change_id")]
    assert len(set(change_ids)) <= 1
    assert service.storage.get_change_by_proposal(p["id"]) is not None


def test_concurrent_applies_deterministic_cas_loser_denied(service, monkeypatch):
    """Carrera determinística: el segundo consume CAS falla → 403."""
    p = propose(service)
    token = accept(service, p["id"])
    token_hash = tokens.hash_token(token)

    real_consume = service.storage.consume_apply_token
    consumed = {"first": False}

    def slow_consume(th, ts):
        if not consumed["first"]:
            consumed["first"] = True
            return real_consume(th, ts)
        return False  # el perdedor de la carrera

    monkeypatch.setattr(service.storage, "consume_apply_token", slow_consume)
    ok = apply_(service, p["id"], token)
    assert ok["change_id"]

    # Una segunda llamada cuyo snapshot (proposal + token) sigue como si la
    # primera aún no hubiera corrido → el CAS de consume es quien decide.
    real_get = service.storage.get_apply_token
    real_get_proposal = service.storage.get_proposal
    token_snapshot = dict(service.storage.get_apply_token(token_hash))
    token_snapshot["consumed_at"] = None
    proposal_snapshot = dict(service.storage.get_proposal(p["id"]))
    proposal_snapshot["state"] = "accepted"
    monkeypatch.setattr(
        service.storage, "get_apply_token",
        lambda th: dict(token_snapshot) if th == token_hash else real_get(th),
    )
    monkeypatch.setattr(
        service.storage, "get_proposal",
        lambda pid: dict(proposal_snapshot) if pid == p["id"] else real_get_proposal(pid),
    )
    err = _err(apply_, service, p["id"], token)
    assert err.status == 403
    assert err.code == "token_already_used"


def test_token_for_different_payload_hash(service, storage):
    """Token emitido para otro payload_hash → 403."""
    p = propose(service)
    token, row = tokens.issue_apply_token(
        proposal_id=p["id"],
        payload_hash="0" * 64,  # hash distinto al de la proposal
        user_id=USER,
        org_id=ORG,
        app_key=APP,
    )
    storage.insert_apply_token(row)
    err = _err(apply_, service, p["id"], token)
    assert err.status == 403
    assert err.code == "invalid_or_expired_token"


def test_token_bound_to_other_org(service, storage):
    p = propose(service, org=ORG)
    token, row = tokens.issue_apply_token(
        proposal_id=p["id"], payload_hash=p["payload_hash"],
        user_id=USER, org_id=OTHER_ORG, app_key=APP,
    )
    storage.insert_apply_token(row)
    err = _err(apply_, service, p["id"], token)
    assert err.status == 403


def test_token_bound_to_other_app(service, storage):
    p = propose(service)
    token, row = tokens.issue_apply_token(
        proposal_id=p["id"], payload_hash=p["payload_hash"],
        user_id=USER, org_id=ORG, app_key="otra-app",
    )
    storage.insert_apply_token(row)
    err = _err(apply_, service, p["id"], token)
    assert err.status == 403


def test_expired_token(service, storage):
    p = propose(service)
    past = datetime.now(timezone.utc) - timedelta(seconds=300)
    token, row = tokens.issue_apply_token(
        proposal_id=p["id"], payload_hash=p["payload_hash"],
        user_id=USER, org_id=ORG, app_key=APP, now=past, ttl_s=120,
    )
    storage.insert_apply_token(row)
    err = _err(apply_, service, p["id"], token)
    assert err.status == 403
    assert err.code == "invalid_or_expired_token"


def test_token_ttl_capped_at_120s():
    with pytest.raises(ValueError):
        tokens.issue_apply_token(
            proposal_id="p", payload_hash="h", user_id="u",
            org_id="o", app_key="a", ttl_s=121,
        )


def test_unknown_token_denied(service):
    p = propose(service)
    err = _err(apply_, service, p["id"], "tok_forged")
    assert err.status == 403


def test_irreversible_requires_strong_ack(service):
    """Sin ack, ni siquiera se emite el apply_token para confirm=strong."""
    p = propose(service, tool="crm.borrar_cuenta", input={"account": "a-1"})
    assert p["confirm_effective"] == "strong"
    err = _err(accept, service, p["id"])  # sin ack
    assert err.status == 400
    assert err.code == "ack_required"
    # con ack se emite, y el apply también lo exige
    token = accept(service, p["id"], ack="APLICAR")
    err = _err(apply_, service, p["id"], token)  # sin ack en apply
    assert err.status == 400
    result = apply_(service, p["id"], token, ack="APLICAR")
    assert result["change_id"]


def test_apply_from_model_context_denied(service, sink):
    p = propose(service)
    token = accept(service, p["id"])
    err = _err(apply_, service, p["id"], token, context="model_context")
    assert err.status == 403
    denied = [e for e in sink.events if e["action"] == "denied"]
    assert denied and denied[-1]["denied_layer"] == "token"


def test_accept_from_model_context_denied(service):
    p = propose(service)
    err = _err(accept, service, p["id"], context="model_context")
    assert err.status == 403


def test_entitlement_stub_denies_by_default(registry, storage, sink):
    """Sin configurar, el stub deniega (§4): ni accept ni apply pasan."""
    from gruia_agent_tools import AgentToolsService

    svc = AgentToolsService(storage=storage, registry=registry, entitlement=StubEntitlement())
    p = propose(svc)
    err = _err(accept, svc, p["id"])
    assert err.status == 403
    # proposal no cambió de estado
    assert svc.storage.get_proposal(p["id"])["state"] == "proposed"


def test_kernel_down_fails_closed(registry, storage):
    """§4/§8: kernel caído → deny fail-closed, audit denied entitlement."""
    def down(url, headers):
        raise ConnectionError("kernel unreachable")

    checker = HttpEntitlementChecker(
        base_url="http://kernel.invalid", service_token="svc", transport=down
    )
    from gruia_agent_tools import AgentToolsService

    svc = AgentToolsService(storage=storage, registry=registry, entitlement=checker)
    p = propose(svc)
    err = _err(accept, svc, p["id"])
    assert err.status == 403
    undelivered = storage.undelivered_outbox(10)
    denied = [r["payload"] for r in undelivered if r["payload"]["action"] == "denied"]
    assert denied and denied[-1]["denied_layer"] == "entitlement"


def test_tool_outside_allowlist_denied(service, registry):
    """§8: tools_allow no cubre la herramienta → deny en entitlement."""
    from gruia_agent_tools import AgentToolsService

    svc = AgentToolsService(
        storage=service.storage, registry=registry,
        entitlement=make_entitlement(tools_allow=["memoria.recordar"]),
    )
    p = propose(svc, tool="crm.borrar_cuenta", input={"account": "a-1"})
    err = _err(accept, svc, p["id"], ack="APLICAR")
    assert err.status == 403


def test_cost_reestimated_upward_returns_409(service, storage, registry, reversible_tool):
    """§4: el coste se re-evalúa en el apply; si escala card→strong → 409."""
    from gruia_agent_tools import AgentToolsService

    svc = AgentToolsService(
        storage=storage, registry=registry,
        entitlement=make_entitlement(threshold_credits=10),
    )
    p = propose(svc)  # estimate=5 <= 10 → confirm card
    assert p["confirm_effective"] == "card"
    token = accept(svc, p["id"])
    reversible_tool.estimate_cost = 50.0  # coste al alza en el apply
    err = _err(apply_, svc, p["id"], token)
    assert err.status == 409
    assert err.code == "cost_changed"


def test_escalation_at_propose_time(service, storage, registry, reversible_tool):
    """§2: coste estimado > umbral de la org ⇒ confirm escalado a strong."""
    from gruia_agent_tools import AgentToolsService

    reversible_tool.estimate_cost = 50.0
    svc = AgentToolsService(
        storage=storage, registry=registry,
        entitlement=make_entitlement(threshold_credits=10),
    )
    p = propose(svc)
    assert p["confirm_effective"] == "strong"
