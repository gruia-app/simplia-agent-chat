"""Validación contra los JSON Schema del paquete de contrato
(packages/agent-chat-contract/schema, SPEC-CHAT-F1-R687 rev 3) con los
mismos códigos de error que el validador TS.

schema errors -> ``schema:<keyword>``; reglas cruzadas -> códigos estables
(read_requires_confirm_none, ..., cost_actual_requires_cost_unit).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import jsonschema

SCHEMA_FILES = {
    "tool-spec": "tool-spec.schema.json",
    "proposal": "proposal.schema.json",
    "change-record": "change-record.schema.json",
    "audit-event": "audit-event.schema.json",
    "view-event": "view-event.schema.json",
}

CONTRACT_ENTITIES = tuple(SCHEMA_FILES.keys())


@dataclass(frozen=True)
class ContractErrorItem:
    code: str
    message: str
    path: str


def default_schema_dir() -> Path:
    """Localiza packages/agent-chat-contract/schema subiendo desde este
    fichero (repo checkout) o via AGENT_CHAT_CONTRACT_SCHEMA_DIR."""
    env = os.environ.get("AGENT_CHAT_CONTRACT_SCHEMA_DIR")
    if env:
        return Path(env)
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "agent-chat-contract" / "schema"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError(
        "agent-chat-contract schemas not found; set AGENT_CHAT_CONTRACT_SCHEMA_DIR"
    )


def load_schemas(schema_dir: Path | None = None) -> dict[str, dict[str, Any]]:
    directory = schema_dir or default_schema_dir()
    return {
        entity: json.loads((directory / filename).read_text(encoding="utf-8"))
        for entity, filename in SCHEMA_FILES.items()
    }


_FORMAT_CHECKER = jsonschema.FormatChecker()

_RFC3339_DT = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$"
)


@_FORMAT_CHECKER.checks("date-time")
def _is_datetime(value: Any) -> bool:
    return isinstance(value, str) and bool(_RFC3339_DT.match(value))


def validate_instance(schema: dict[str, Any], document: Any) -> list[ContractErrorItem]:
    """Valida `document` contra un JSON Schema arbitrario (p. ej. el
    `input_schema` de una herramienta)."""
    return _schema_errors(schema, document)


def _schema_errors(schema: dict[str, Any], document: Any) -> list[ContractErrorItem]:
    validator = jsonschema.validators.validator_for(schema)(
        schema, format_checker=_FORMAT_CHECKER
    )
    items: list[ContractErrorItem] = []
    seen: set[tuple[str, str]] = set()
    for error in validator.iter_errors(document):
        keyword = error.validator
        path = "/" + "/".join(str(part) for part in error.absolute_path)
        schema_path = tuple(str(p) for p in error.absolute_schema_path)
        codes = [f"schema:{keyword}"]
        # Paridad con ajv: el fallo dentro de un anyOf también reporta el
        # anyOf del padre.
        if "anyOf" in schema_path:
            codes.append("schema:anyOf")
        for code in codes:
            key = (code, path)
            if key in seen:
                continue
            seen.add(key)
            items.append(ContractErrorItem(code=code, message=error.message, path=path))
    return items


def validate_entity(entity: str, document: Any, schemas: dict[str, Any] | None = None) -> list[ContractErrorItem]:
    """Errores de validación estructural ([] = válido)."""
    schemas = schemas or load_schemas()
    schema = schemas.get(entity)
    if schema is None:
        return [ContractErrorItem(code="schema:unknown_entity", message=f"unknown entity {entity}", path="")]
    return _schema_errors(schema, document)


def validate_toolspec_rules(spec: dict[str, Any]) -> list[ContractErrorItem]:
    """Reglas cruzadas de §2 (paridad con validateToolSpecRules de TS)."""
    errors: list[ContractErrorItem] = []

    def push(code: str, message: str, path: str) -> None:
        errors.append(ContractErrorItem(code=code, message=message, path=path))

    effect = spec.get("effect")
    confirm = spec.get("confirm")
    if effect == "read" and confirm != "none":
        push("read_requires_confirm_none", 'effect "read" requires confirm "none"', "/confirm")
    if effect == "reversible" and confirm not in ("card", "strong"):
        push(
            "reversible_requires_card_or_strong",
            'effect "reversible" requires confirm "card" or "strong"',
            "/confirm",
        )
    if effect == "irreversible":
        if confirm != "strong":
            push(
                "irreversible_requires_confirm_strong",
                'effect "irreversible" requires confirm "strong"',
                "/confirm",
            )
        undo = spec.get("undo") or {}
        if undo.get("mode") not in ("none", "compensate"):
            push(
                "irreversible_forbids_undo_revert",
                'effect "irreversible" requires undo.mode "none" or "compensate"',
                "/undo/mode",
            )
    cost = spec.get("cost") or {}
    if cost.get("kind") not in (None, "none") and cost.get("estimator") is not True:
        push("cost_kind_requires_estimator", 'cost.kind other than "none" requires estimator true', "/cost/estimator")
    return errors


def validate_change_record_rules(record: dict[str, Any]) -> list[ContractErrorItem]:
    errors: list[ContractErrorItem] = []
    if isinstance(record.get("cost_actual"), (int, float)) and not isinstance(
        record.get("cost_actual"), bool
    ) and record.get("cost_unit") is None:
        errors.append(
            ContractErrorItem(
                code="cost_actual_requires_cost_unit",
                message="cost_actual requires a non-null cost_unit",
                path="/cost_unit",
            )
        )
    return errors


def validate_document(entity: str, document: Any, schemas: dict[str, Any] | None = None) -> list[ContractErrorItem]:
    """Esquema + reglas cruzadas aplicables a la entidad."""
    schema_errors = validate_entity(entity, document, schemas)
    if schema_errors:
        return schema_errors
    if entity == "tool-spec":
        return validate_toolspec_rules(document)
    if entity == "change-record":
        return validate_change_record_rules(document)
    return []


class ContractValidationError(Exception):
    def __init__(self, entity: str, errors: Iterable[ContractErrorItem]):
        self.entity = entity
        self.errors = list(errors)
        super().__init__(
            f"{entity} failed contract validation: "
            + "; ".join(f"{e.code} {e.path or '/'} {e.message}" for e in self.errors)
        )


def assert_valid(entity: str, document: Any, schemas: dict[str, Any] | None = None) -> None:
    errors = validate_document(entity, document, schemas)
    if errors:
        raise ContractValidationError(entity, errors)
