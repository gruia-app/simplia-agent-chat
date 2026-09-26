"""§3 ciclo de vida, §4 gracia/revert, §6 auditoría y outbox."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from gruia_agent_tools import AUDIT_FIELDS, ContractError, JsonLinesSink
from gruia_agent_tools.contract import validate_document

from .conftest import (
    ORG,
    USER,
    accept,
    apply_,
    happy_path,
    propose,
)


def _err(fn, *args, **kw):
    with pytest.raises(ContractError) as ei:
        fn(*args, **kw)
    return ei.value


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- ciclo §3

def test_modify_creates_superseding_proposal(service):
    p = propose(service)
    new = service.modify_proposal(
        p["id"], new_input={"fact": "otro"}, actor_user_id=USER
    )["proposal"]
    assert new["supersedes"] == p["id"]
    assert new["state"] == "proposed"
    assert service.storage.get_proposal(p["id"])["state"] == "discarded"


def test_discard_proposed(service):
    p = propose(service)
    result = service.discard_proposal(p["id"], actor_user_id=USER)
    assert result["proposal"]["state"] == "discarded"


def test_invalid_transition_409(service):
    p, change_id = happy_path(service)
    err = _err(accept, service, p["id"])
    assert err.status == 409  # applied → accept no es transición válida


def test_proposal_expires(service):
    p = propose(service, now=_now() - timedelta(seconds=600))
    err = _err(accept, service, p["id"], now=_now())
    assert err.status == 410
    assert service.storage.get_proposal(p["id"])["state"] == "expired"


def test_actor_other_user_forbidden(service):
    p = propose(service)
    err = _err(accept, service, p["id"], user="user-2")
    assert err.status == 403


def test_list_proposals_isolated_by_org(service):
    propose(service)
    propose(service, org="org-2")
    mine = service.list_proposals(thread_id="thread-1", org_id=ORG)["proposals"]
    assert len(mine) == 1 and all(p["org_id"] == ORG for p in mine)


# ----------------------------------------------------------------- gracia

def _grace_registry(service, reversible_tool):
    """Herramienta reversible con gracia de 60 s."""
    spec = {
        "name": "memoria.gracia",
        "description": "Hecho con gracia de 60 segundos",
        "input_schema": {"type": "object", "properties": {"fact": {"type": "string"}}, "required": ["fact"]},
        "effect": "reversible",
        "cost": {"kind": "none", "estimator": False},
        "confirm": "card",
        "undo": {"mode": "revert", "window_s": 300, "grace_s": 60},
        "app_key": "insaidr",
    }
    service.registry.register(spec, reversible_tool)
    return spec


def test_grace_discard_cancels_effect(service, reversible_tool):
    _grace_registry(service, reversible_tool)
    p = propose(service, tool="memoria.gracia")
    token = accept(service, p["id"])
    result = apply_(service, p["id"], token)
    assert result["proposal"]["state"] == "applied"
    assert result["change_id"] is None  # efecto aún no ejecutado
    assert reversible_tool.applied == []

    out = service.discard_proposal(p["id"], actor_user_id=USER)
    assert out["grace_cancelled"] is True
    assert out["proposal"]["state"] == "discarded"
    # ni ahora ni después se ejecuta el efecto
    service.run_due_grace_jobs(now=_now() + timedelta(seconds=120))
    assert reversible_tool.applied == []


def test_grace_job_applies_effect_at_expiry(service, reversible_tool):
    _grace_registry(service, reversible_tool)
    p = propose(service, tool="memoria.gracia")
    token = accept(service, p["id"])
    apply_(service, p["id"], token)
    ran = service.run_due_grace_jobs(now=_now() + timedelta(seconds=61))
    assert ran == 1
    assert len(reversible_tool.applied) == 1
    assert service.storage.get_change_by_proposal(p["id"]) is not None
    # discard fuera de gracia → 410
    err = _err(service.discard_proposal, p["id"], actor_user_id=USER,
               now=_now() + timedelta(seconds=61))
    assert err.status == 410


# ----------------------------------------------------------------- revert

def test_revert_token_and_revert(service, sink, reversible_tool):
    p, change_id = happy_path(service)
    token = service.create_revert_token(
        change_id, actor_user_id=USER, org_id=ORG
    )["revert_token"]
    result = service.revert_change(
        change_id, token=token, actor_user_id=USER, context="user_confirmed"
    )
    assert result["change"]["state"] == "reverted"
    assert reversible_tool.reverted == [change_id]
    actions = [e["action"] for e in sink.events]
    assert "reverted" in actions


def test_revert_outside_undo_window(service):
    p, change_id = happy_path(service)
    future = _now() + timedelta(seconds=301)  # window_s = 300
    err = _err(
        service.create_revert_token,
        change_id, actor_user_id=USER, org_id=ORG, now=future,
    )
    assert err.status == 410


def test_revert_token_other_org_404(service):
    p, change_id = happy_path(service)
    err = _err(
        service.create_revert_token,
        change_id, actor_user_id=USER, org_id="org-2",
    )
    assert err.status == 404  # aislamiento: no revela existencia


def test_compensate_after_window(service, irreversible_tool):
    """undo.mode=compensate: se puede compensar incluso fuera de ventana."""
    p = propose(service, tool="crm.borrar_cuenta", input={"account": "a-1"})
    token = accept(service, p["id"], ack="APLICAR")
    result = apply_(service, p["id"], token, ack="APLICAR")
    change_id = result["change_id"]
    out = service.compensate_change(
        change_id, actor_user_id=USER, context="user_confirmed",
        now=_now() + timedelta(days=30),
    )
    assert out["change"]["state"] == "compensated"
    assert irreversible_tool.compensated == [change_id]


# ----------------------------------------------------------------- §6 audit

def test_audit_events_exact_fields_and_schema_valid(service, sink):
    happy_path(service)
    assert sink.events, "expected audit events"
    actions = [e["action"] for e in sink.events]
    assert actions[:3] == ["proposed", "accepted", "applied"]
    for event in sink.events:
        assert set(event.keys()) == set(AUDIT_FIELDS)
        errors = validate_document("audit-event", event)
        assert errors == [], errors


def test_audit_denied_event(service, sink):
    p = propose(service)
    _err(accept, service, p["id"], context="model_context")
    denied = [e for e in sink.events if e["action"] == "denied"]
    assert len(denied) == 1
    e = denied[0]
    assert e["denied_layer"] == "token"
    assert e["result"] == "error"
    assert validate_document("audit-event", e) == []


def test_applied_event_in_same_tx_as_change(service, storage, registry):
    """§6: applied sale al outbox dentro del tx del efecto — sin drainer,
    el evento applied queda pendiente junto al change ya registrado."""
    from gruia_agent_tools import AgentToolsService

    svc = AgentToolsService(
        storage=storage, registry=registry,
        entitlement=service.entitlement, outbox_sink=None,
    )
    p, change_id = _happy(svc)
    change = storage.get_change_by_proposal(p["id"])
    assert change is not None
    pending = {r["payload"]["action"] for r in storage.undelivered_outbox(10)}
    assert "applied" in pending


def test_outbox_survives_sink_down(service, storage, registry, reversible_tool):
    """§6: sink caído → eventos quedan en outbox; al volver se entregan."""
    class DownSink:
        def deliver(self, events):
            raise ConnectionError("sink down")

    from gruia_agent_tools import AgentToolsService, OutboxDrainer

    svc = AgentToolsService(
        storage=storage, registry=registry,
        entitlement=service.entitlement, outbox_sink=DownSink(),
    )
    p, change_id = _happy(svc)
    pending = storage.undelivered_outbox(10)
    assert len(pending) == 3  # proposed + accepted + applied retenidos
    actions = {r["payload"]["action"] for r in pending}
    assert {"proposed", "accepted", "applied"} <= actions

    # el sink vuelve → drain entrega todo y marca delivered_at
    sink = JsonLinesSink()
    drainer = OutboxDrainer(storage, sink)
    delivered = drainer.drain(now_iso="2026-09-24T12:00:00Z")
    assert delivered == 3
    assert storage.undelivered_outbox(10) == []
    assert len(sink.events) == 3


def test_outbox_dedup_by_event_id(storage):
    """§6: reintentos del mismo event_id no duplican."""
    event = {
        "event_id": "evt-dup-1",
        "ts": "2026-09-24T12:00:00Z",
        "created_at": "2026-09-24T12:00:00Z",
    }
    assert storage.insert_outbox_events([event]) == 1
    assert storage.insert_outbox_events([event]) == 0  # dedup
    assert len(storage.undelivered_outbox(10)) == 1


def _happy(svc):
    p = propose(svc)
    token = accept(svc, p["id"])
    result = apply_(svc, p["id"], token)
    return p, result["change_id"]
