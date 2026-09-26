"""Paridad de contrato: las mismas fixtures que valida el paquete TS
(packages/agent-chat-contract/fixtures/contract) deben dar el mismo
veredicto aquí — válido pasa, inválido produce el expected_error."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from gruia_agent_tools import contract

FIXTURES = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "agent-chat-contract"
    / "fixtures"
    / "contract"
)


def load(kind: str):
    return [
        (p.stem, json.loads(p.read_text(encoding="utf-8")))
        for p in sorted((FIXTURES / kind).glob("*.json"))
    ]


@pytest.mark.parametrize("name,fixture", load("valid"), ids=[n for n, _ in load("valid")])
def test_valid_fixtures(name, fixture):
    errors = contract.validate_document(fixture["entity"], fixture["document"])
    assert errors == [], f"{name}: {[f'{e.code} {e.path}' for e in errors]}"


@pytest.mark.parametrize("name,fixture", load("invalid"), ids=[n for n, _ in load("invalid")])
def test_invalid_fixtures(name, fixture):
    errors = contract.validate_document(fixture["entity"], fixture["document"])
    codes = [e.code for e in errors]
    assert fixture["expected_error"] in codes, f"{name}: expected {fixture['expected_error']}, got {codes}"


def test_audit_event_never_leaks_input_or_preview():
    """§6: un AuditEvent con input/preview es inválido por esquema
    (additionalProperties)."""
    fixture = json.loads(
        (FIXTURES / "invalid" / "audit-event-with-input.json").read_text()
    )
    errors = contract.validate_document("audit-event", fixture["document"])
    assert any(e.code == "schema:additionalProperties" for e in errors)
