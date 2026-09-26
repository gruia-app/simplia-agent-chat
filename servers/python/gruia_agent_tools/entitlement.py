"""Capa 1 de las tres del apply (§4): entitlement chat_tools.

- Hasta F2, `StubEntitlement` deniega por defecto (§4).
- `ChatToolsEntitlementChecker` implementa §8: una fila por
  (org_id, app_key) con {enabled, tools_allow, max_effect, byo_llm,
  cost_threshold}; se consulta con GET /v1/entitlements/{org}/{app} y el
  token de servicio de la app — nunca con el JWT de sesión.
- Fail-closed: si el kernel no responde, se deniega (§4). La caché de
  decisiones dura como máximo 60 s.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class CostThreshold:
    credits: float | None = None
    money_cents: float | None = None


@dataclass(frozen=True)
class ChatToolsEntitlement:
    enabled: bool
    tools_allow: tuple[str, ...] = ()
    max_effect: str = "read"
    byo_llm: bool = False
    cost_threshold: CostThreshold = field(default_factory=CostThreshold)

    @classmethod
    def from_row(cls, row: dict[str, Any] | None) -> "ChatToolsEntitlement":
        if not row:
            return cls(enabled=False)
        threshold = row.get("cost_threshold") or {}
        tools = row.get("tools_allow") or []
        return cls(
            enabled=bool(row.get("enabled")),
            tools_allow=tuple(tools if tools != "*" else ("*",)),
            max_effect=row.get("max_effect") or "read",
            byo_llm=bool(row.get("byo_llm")),
            cost_threshold=CostThreshold(
                credits=threshold.get("credits"),
                money_cents=threshold.get("money_cents"),
            ),
        )


_EFFECT_ORDER = {"read": 0, "reversible": 1, "irreversible": 2}


@dataclass(frozen=True)
class EntitlementDecision:
    allowed: bool
    denied_layer: str | None = None
    reason: str | None = None
    entitlement: ChatToolsEntitlement | None = None


class EntitlementChecker(Protocol):
    def decide(
        self, *, org_id: str, app_key: str, user_id: str, tool_name: str, effect: str
    ) -> EntitlementDecision: ...


class StubEntitlement:
    """Hasta F2: por defecto deniega. `allow` o `rows` lo abren en tests."""

    def __init__(self, allow: bool = False, rows: dict[tuple[str, str], dict[str, Any]] | None = None):
        self._allow = allow
        self._rows = rows or {}

    def decide(self, *, org_id: str, app_key: str, user_id: str, tool_name: str, effect: str) -> EntitlementDecision:
        if not self._allow:
            return EntitlementDecision(allowed=False, denied_layer="entitlement", reason="entitlement_stub_denied")
        row = self._rows.get((org_id, app_key))
        if row is None:
            # permitido sin fila: no hay umbral ni límites extra
            return EntitlementDecision(allowed=True)
        ent = ChatToolsEntitlement.from_row(row)
        return evaluate_entitlement(ent, tool_name=tool_name, effect=effect)


def evaluate_entitlement(
    entitlement: ChatToolsEntitlement, *, tool_name: str, effect: str
) -> EntitlementDecision:
    """§8: enabled + tools_allow + max_effect (§8: el servidor comprueba
    tools_allow y max_effect en apply)."""
    if not entitlement.enabled:
        return EntitlementDecision(allowed=False, denied_layer="entitlement", reason="chat_tools_disabled", entitlement=entitlement)
    allow = entitlement.tools_allow
    if allow and "*" not in allow and tool_name not in allow:
        return EntitlementDecision(allowed=False, denied_layer="entitlement", reason="tool_not_allowed", entitlement=entitlement)
    if _EFFECT_ORDER[effect] > _EFFECT_ORDER[entitlement.max_effect]:
        return EntitlementDecision(allowed=False, denied_layer="entitlement", reason="max_effect_exceeded", entitlement=entitlement)
    return EntitlementDecision(allowed=True, entitlement=entitlement)


class HttpEntitlementChecker:
    """Cliente §8 para el kernel (F2): GET /v1/entitlements/{org}/{app} con
    token de servicio. Fail-closed: cualquier error → deny. Caché <= 60 s."""

    def __init__(self, *, base_url: str, service_token: str, transport=None, cache_ttl_s: float = 60.0):
        self._base_url = base_url.rstrip("/")
        self._service_token = service_token
        self._transport = transport  # callable(url, headers) -> {status, json}
        self._cache_ttl_s = min(cache_ttl_s, 60.0)
        self._cache: dict[tuple[str, str], tuple[float, dict[str, Any] | None]] = {}

    def _fetch_row(self, org_id: str, app_key: str) -> dict[str, Any] | None:
        key = (org_id, app_key)
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] <= self._cache_ttl_s:
            return cached[1]
        if self._transport is None:
            raise RuntimeError("entitlement transport not configured")
        url = f"{self._base_url}/v1/entitlements/{org_id}/{app_key}"
        result = self._transport(url, {"authorization": f"Bearer {self._service_token}"})
        if result.get("status") != 200:
            raise RuntimeError(f"entitlement http {result.get('status')}")
        row = result.get("json") or {}
        self._cache[key] = (time.monotonic(), row)
        return row

    def decide(self, *, org_id: str, app_key: str, user_id: str, tool_name: str, effect: str) -> EntitlementDecision:
        try:
            row = self._fetch_row(org_id, app_key)
        except Exception as exc:  # kernel caído / red / 5xx → deny (§4)
            return EntitlementDecision(
                allowed=False, denied_layer="entitlement", reason=f"entitlement_unavailable:{type(exc).__name__}"
            )
        return evaluate_entitlement(
            ChatToolsEntitlement.from_row(row), tool_name=tool_name, effect=effect
        )
