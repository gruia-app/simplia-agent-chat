"""AuditEvent (§6) y outbox.

- Campos exactos de §6; nunca input, preview ni contenido.
- At-least-once, deduplicación por event_id.
- Los eventos `applied`, `reverted` y `compensated` se escriben en el
  outbox local dentro de la MISMA transacción que el efecto.
- Sink configurable (log JSON por defecto hasta F2; HttpAuditSink con la
  forma de F2: POST /v1/audit/events, lotes <= 100, respuesta 202,
  idempotente por event_id).
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Protocol

AUDIT_ACTIONS = (
    "proposed",
    "accepted",
    "applied",
    "reverted",
    "compensated",
    "discarded",
    "expired",
    "denied",
)

AUDIT_FIELDS = (
    "schema_version",
    "event_id",
    "ts",
    "org_id",
    "app_key",
    "user_id",
    "tool",
    "proposal_id",
    "change_id",
    "payload_hash",
    "action",
    "confirm_effective",
    "denied_layer",
    "cost_estimate",
    "cost_actual",
    "cost_unit",
    "result",
    "error_code",
)


def build_audit_event(
    *,
    ts: str,
    org_id: str,
    app_key: str,
    user_id: str,
    tool: str,
    proposal_id: str,
    payload_hash: str,
    action: str,
    confirm_effective: str,
    result: str,
    change_id: str | None = None,
    denied_layer: str | None = None,
    cost_estimate: float = 0.0,
    cost_actual: float | None = None,
    cost_unit: str | None = None,
    error_code: str | None = None,
    event_id: str | None = None,
) -> dict[str, Any]:
    """Construye un AuditEvent con exactamente los campos de §6."""
    if action not in AUDIT_ACTIONS:
        raise ValueError(f"invalid audit action {action}")
    if result not in ("ok", "error"):
        raise ValueError(f"invalid audit result {result}")
    return {
        "schema_version": 1,
        "event_id": event_id or str(uuid.uuid4()),
        "ts": ts,
        "org_id": org_id,
        "app_key": app_key,
        "user_id": user_id,
        "tool": tool,
        "proposal_id": proposal_id,
        "change_id": change_id,
        "payload_hash": payload_hash,
        "action": action,
        "confirm_effective": confirm_effective,
        "denied_layer": denied_layer,
        "cost_estimate": cost_estimate,
        "cost_actual": cost_actual,
        "cost_unit": cost_unit,
        "result": result,
        "error_code": error_code,
    }


class AuditSink(Protocol):
    def deliver(self, events: list[dict[str, Any]]) -> None: ...


@dataclass
class JsonLinesSink:
    """Sink por defecto hasta F2: log JSON (una línea por evento)."""

    stream: Any = field(default=None)  # file-like; si None, acumula en .events
    events: list[dict[str, Any]] = field(default_factory=list)

    def deliver(self, events: list[dict[str, Any]]) -> None:
        for event in events:
            line = json.dumps(event, separators=(",", ":"), sort_keys=True)
            if self.stream is not None:
                self.stream.write(line + "\n")
            self.events.append(event)
        if self.stream is not None:
            self.stream.flush()


@dataclass
class HttpAuditSink:
    """Forma de F2: POST {base_url}/v1/audit/events en lotes <= 100,
    respuesta 202, idempotente por event_id, auth con token de servicio.
    `transport(url, headers, body) -> {"status": int}` inyectable."""

    base_url: str
    service_token: str
    transport: Any
    batch_size: int = 100

    def deliver(self, events: list[dict[str, Any]]) -> None:
        for start in range(0, len(events), min(self.batch_size, 100)):
            batch = events[start : start + min(self.batch_size, 100)]
            result = self.transport(
                f"{self.base_url.rstrip('/')}/v1/audit/events",
                {"authorization": f"Bearer {self.service_token}", "content-type": "application/json"},
                {"events": batch},
            )
            if result.get("status") != 202:
                raise RuntimeError(f"audit sink http {result.get('status')}")


class OutboxDrainer:
    """Drena el outbox local hacia el sink. Si el sink está caído, los
    eventos quedan pendientes — ninguno se pierde (§6)."""

    def __init__(self, storage, sink: AuditSink, *, batch_size: int = 100):
        self._storage = storage
        self._sink = sink
        self._batch_size = batch_size

    def drain(self, *, now_iso: str, limit: int | None = None) -> int:
        """Entrega los pendientes y los marca delivered_at. Devuelve cuántos."""
        delivered = 0
        while True:
            batch = self._storage.undelivered_outbox(min(self._batch_size, limit or self._batch_size))
            if not batch:
                return delivered
            events = [row["payload"] for row in batch]
            self._sink.deliver(events)  # lanza -> nada se marca; reintento posterior
            self._storage.mark_outbox_delivered([row["event_id"] for row in batch], now_iso)
            delivered += len(batch)
            if limit is not None and delivered >= limit:
                return delivered
