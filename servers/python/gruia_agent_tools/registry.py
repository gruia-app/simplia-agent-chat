"""Registro de herramientas (§1/§2). Cada herramienta = ToolSpec validada
+ implementación por la app (estimate/preview/apply/revert|compensate).

§4 «cero parseo de texto libre»: el registro nunca acepta acciones como
texto del modelo — solo ToolSpec + input estructurado.
"""

from __future__ import annotations

from typing import Any, Protocol

from . import contract
from .errors import bad_request, unprocessable


class ToolImplementation(Protocol):
    """Implementación por herramienta en el backend de la app (§2)."""

    def estimate(self, input: dict[str, Any]) -> Any: ...

    def preview(self, input: dict[str, Any]) -> Any:
        """Diff estructurado y sin efectos."""
        ...

    def apply(self, input: dict[str, Any], idempotency_key: str) -> str:
        """Ejecuta y devuelve change_id. idempotency_key = proposal_id (§4)."""
        ...

    def revert(self, change_id: str) -> None: ...

    def compensate(self, change_id: str) -> None: ...


class ToolRegistry:
    def __init__(self, schemas: dict | None = None):
        self._schemas = schemas or contract.load_schemas()
        self._tools: dict[str, tuple[dict, ToolImplementation]] = {}

    def register(self, toolspec: dict[str, Any], implementation: ToolImplementation) -> None:
        """Valida ToolSpec (esquema + reglas §2) y la registra por name."""
        errors = contract.validate_document("tool-spec", toolspec, self._schemas)
        if errors:
            raise unprocessable(
                f"invalid toolspec: {errors[0].code} {errors[0].message}", "invalid_toolspec"
            )
        # §2: input_schema debe ser un JSON Schema de objeto
        if not isinstance(toolspec["input_schema"], dict):
            raise unprocessable("input_schema must be a JSON Schema object", "invalid_toolspec")
        name = toolspec["name"]
        self._tools[name] = (toolspec, implementation)

    def get(self, name: str) -> tuple[dict, ToolImplementation]:
        try:
            return self._tools[name]
        except KeyError:
            raise bad_request(f"unknown tool {name}", "unknown_tool")

    def list(self) -> list[dict]:
        return [spec for spec, _ in self._tools.values()]

    def validate_input(self, name: str, input: dict[str, Any]) -> list[contract.ContractErrorItem]:
        spec, _ = self.get(name)
        schema = spec["input_schema"]
        return contract.validate_instance(schema, input)
