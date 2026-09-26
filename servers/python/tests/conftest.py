"""Fixtures compartidas: storage sqlite en memoria, dos herramientas de
prueba (reversible/revert y irreversible/compensate), servicio con
entitlement stub que permite y umbral de coste."""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from gruia_agent_tools import (  # noqa: E402
    AgentToolsService,
    JsonLinesSink,
    SqliteStorage,
    StubEntitlement,
    ToolRegistry,
    load_schemas,
)

PROPOSAL_REF_SCHEMA = load_schemas()["proposal-ref"]

ORG = "org-1"
OTHER_ORG = "org-2"
APP = "insaidr"
USER = "user-1"
THREAD = "thread-1"

REVERSIBLE_SPEC = {
    "name": "memoria.recordar",
    "description": "Guarda un hecho en la memoria de la organizacion",
    "input_schema": {
        "type": "object",
        "properties": {"fact": {"type": "string", "minLength": 1}},
        "required": ["fact"],
        "additionalProperties": False,
    },
    "effect": "reversible",
    "cost": {"kind": "credits", "estimator": True},
    "confirm": "card",
    "undo": {"mode": "revert", "window_s": 300, "grace_s": 0},
    "app_key": APP,
    "output_schema": PROPOSAL_REF_SCHEMA,
}

IRREVERSIBLE_SPEC = {
    "name": "crm.borrar_cuenta",
    "description": "Borra definitivamente la cuenta del CRM",
    "input_schema": {
        "type": "object",
        "properties": {"account": {"type": "string"}},
        "required": ["account"],
        "additionalProperties": False,
    },
    "effect": "irreversible",
    "cost": {"kind": "none", "estimator": False},
    "confirm": "strong",
    "undo": {"mode": "compensate", "window_s": 0, "grace_s": 0},
    "app_key": APP,
    "output_schema": PROPOSAL_REF_SCHEMA,
}


class FakeTool:
    """Implementación por app: estimador mutable para el test de 409."""

    def __init__(self, estimate_cost: float = 5.0):
        self.estimate_cost = estimate_cost
        self.applied: list[dict] = []
        self.reverted: list[str] = []
        self.compensated: list[str] = []
        self._counter = 0

    def estimate(self, input):
        return {"credits": self.estimate_cost, "cost_unit": "credits"}

    def preview(self, input):
        return {"ops": [{"op": "add", "path": "/fact", "value": input}]}

    def apply(self, input, idempotency_key):
        # idempotencia por proposal_id: la misma key devuelve el mismo change
        for entry in self.applied:
            if entry["idempotency_key"] == idempotency_key:
                return entry["change_id"]
        self._counter += 1
        change_id = f"chg-{self._counter:04d}"
        self.applied.append({"change_id": change_id, "idempotency_key": idempotency_key, "input": input})
        return change_id

    def revert(self, change_id):
        self.reverted.append(change_id)

    def compensate(self, change_id):
        self.compensated.append(change_id)


@pytest.fixture
def reversible_tool():
    return FakeTool()


@pytest.fixture
def irreversible_tool():
    return FakeTool()


@pytest.fixture
def registry(reversible_tool, irreversible_tool):
    reg = ToolRegistry()
    reg.register(REVERSIBLE_SPEC, reversible_tool)
    reg.register(IRREVERSIBLE_SPEC, irreversible_tool)
    return reg


@pytest.fixture
def storage():
    return SqliteStorage(":memory:")


@pytest.fixture
def sink():
    return JsonLinesSink()


def make_entitlement(allow=True, threshold_credits=None, tools_allow=None, max_effect="irreversible"):
    row = {
        "enabled": allow,
        "tools_allow": tools_allow if tools_allow is not None else ["memoria.recordar", "memoria.gracia", "crm.borrar_cuenta"],
        "max_effect": max_effect,
        "cost_threshold": {"credits": threshold_credits} if threshold_credits is not None else {},
    }
    return StubEntitlement(allow=allow, rows={(ORG, APP): row})


@pytest.fixture
def service(storage, registry, sink):
    return AgentToolsService(
        storage=storage,
        registry=registry,
        entitlement=make_entitlement(),
        outbox_sink=sink,
    )


def propose(service, tool="memoria.recordar", input=None, org=ORG, user=USER, **kw):
    return service.create_proposal(
        tool=tool,
        input=input if input is not None else {"fact": "dato"},
        org_id=org,
        user_id=user,
        thread_id=THREAD,
        **kw,
    )["proposal"]


def accept(service, proposal_id, user=USER, context="user_confirmed", ack=None, **kw):
    return service.accept_proposal(
        proposal_id, actor_user_id=user, context=context, ack=ack, **kw
    )["apply_token"]


def apply_(service, proposal_id, token, user=USER, context="user_confirmed", ack=None, **kw):
    return service.apply_proposal(
        proposal_id, token=token, actor_user_id=user, context=context, ack=ack, **kw
    )


def happy_path(service, *, ack=None):
    """propose → accept → apply de la herramienta reversible; devuelve ids."""
    p = propose(service)
    token = accept(service, p["id"], ack=ack)
    result = apply_(service, p["id"], token, ack=ack)
    return p, result["change_id"]
