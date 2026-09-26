"""Interfaz de almacenamiento (SPEC §1: «almacenamiento mediante interfaz,
con implementación de referencia en SQL»).

Toda mutación que altera el estado expone su operación CAS para la
idempotencia y la concurrencia de §4.
"""

from __future__ import annotations

import abc
from typing import Any, Iterable


class Storage(abc.ABC):
    # -- proposals -------------------------------------------------------
    @abc.abstractmethod
    def insert_proposal(self, proposal: dict[str, Any]) -> None: ...

    @abc.abstractmethod
    def get_proposal(self, proposal_id: str) -> dict[str, Any] | None: ...

    @abc.abstractmethod
    def list_proposals(self, thread_id: str) -> list[dict[str, Any]]: ...

    @abc.abstractmethod
    def cas_proposal_state(
        self, proposal_id: str, from_state: str, updates: dict[str, Any]
    ) -> bool:
        """UPDATE proposals SET ... WHERE id=? AND state=? — true si ganó."""

    # -- apply tokens ----------------------------------------------------
    @abc.abstractmethod
    def insert_apply_token(self, token: dict[str, Any]) -> None: ...

    @abc.abstractmethod
    def get_apply_token(self, token_hash: str) -> dict[str, Any] | None: ...

    @abc.abstractmethod
    def consume_apply_token(self, token_hash: str, consumed_at: str) -> bool:
        """CAS: marca consumed_at solo si era NULL — true si esta llamada ganó."""

    # -- revert tokens ---------------------------------------------------
    @abc.abstractmethod
    def insert_revert_token(self, token: dict[str, Any]) -> None: ...

    @abc.abstractmethod
    def get_revert_token(self, token_hash: str) -> dict[str, Any] | None: ...

    @abc.abstractmethod
    def consume_revert_token(self, token_hash: str, consumed_at: str) -> bool: ...

    # -- changes ---------------------------------------------------------
    @abc.abstractmethod
    def get_change(self, change_id: str) -> dict[str, Any] | None: ...

    @abc.abstractmethod
    def get_change_by_proposal(self, proposal_id: str) -> dict[str, Any] | None: ...

    @abc.abstractmethod
    def insert_change(self, change: dict[str, Any], outbox_events: Iterable[dict[str, Any]]) -> bool:
        """Inserta change + eventos de outbox en la MISMA transacción (§6).
        Devuelve False si ya existía un change para la proposal (idempotencia)."""

    @abc.abstractmethod
    def update_change_state(
        self, change_id: str, updates: dict[str, Any], outbox_events: Iterable[dict[str, Any]]
    ) -> bool:
        """Actualiza estado del change (reverted/compensated) + outbox, mismo tx."""

    # -- grace jobs ------------------------------------------------------
    @abc.abstractmethod
    def insert_grace_job(self, job: dict[str, Any]) -> None: ...

    @abc.abstractmethod
    def due_grace_jobs(self, now_iso: str) -> list[dict[str, Any]]: ...

    @abc.abstractmethod
    def cas_grace_job_status(self, job_id: str, from_status: str, updates: dict[str, Any]) -> bool: ...

    @abc.abstractmethod
    def get_grace_job_by_proposal(self, proposal_id: str) -> dict[str, Any] | None: ...

    # -- audit outbox ----------------------------------------------------
    @abc.abstractmethod
    def insert_outbox_events(self, events: Iterable[dict[str, Any]]) -> int:
        """Idempotente por event_id (§6). Devuelve cuántos se insertaron."""

    @abc.abstractmethod
    def undelivered_outbox(self, limit: int) -> list[dict[str, Any]]: ...

    @abc.abstractmethod
    def mark_outbox_delivered(self, event_ids: Iterable[str], delivered_at: str) -> None: ...

    # -- tx --------------------------------------------------------------
    @abc.abstractmethod
    def transaction(self):
        """Context manager: commit al salir limpio, rollback ante excepción."""
