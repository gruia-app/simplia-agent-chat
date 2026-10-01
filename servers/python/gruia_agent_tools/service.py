"""AgentToolsService: las 10 rutas de §5 como métodos.

§4 de principio a fin: validate → entitlement → role → policy → apply;
token un solo uso ligado a (proposal_id, payload_hash, user_id, org_id,
app_key), sha256 en servidor, comparación en tiempo constante, TTL <= 120 s;
idempotencia por proposal_id; concurrencia por CAS; gracia en el servidor;
outbox local en la misma transacción para applied/reverted/compensated.

El servicio nunca confía en claims del cliente: el actor/contexto llegan de
la sesión autenticada del transporte (X-Actor-Context o equivalente).
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

from . import audit as audit_mod
from . import contract, tokens
from .entitlement import EntitlementChecker, StubEntitlement
from .errors import (
    ContractError,
    bad_request,
    conflict,
    forbidden,
    gone,
    not_found,
    unprocessable,
)
from .registry import ToolRegistry


class RoleChecker(Protocol):
    """Capa 2: permiso del actor dentro de la org (server-side)."""

    def decide(self, *, org_id: str, user_id: str, tool_name: str, input: dict) -> bool: ...


class PolicyChecker(Protocol):
    """Capa 3: política de la app sobre preview/estimate (server-side)."""

    def decide(self, *, org_id: str, user_id: str, toolspec: dict, preview: Any, estimate: Any) -> bool: ...


class _AllowAll:
    def decide(self, **kwargs) -> bool:
        return True


@dataclass(frozen=True)
class RouteInfo:
    """Canal por el que llegó la acción (§6 rev 4): lo fija el transporte
    autenticado (UI, gateway MCP, CLI), nunca el cliente."""

    via: str = "ui"  # ui | mcp | cli
    client_id: str | None = None
    client_verified: bool | None = None
    confirm_channel: str | None = None  # ui|review_url|elicitation|cli_tty|null

    @classmethod
    def from_row(cls, row: dict[str, Any] | None) -> "RouteInfo":
        row = row or {}
        return cls(
            via=row.get("via") or "ui",
            client_id=row.get("client_id"),
            client_verified=row.get("client_verified"),
            confirm_channel=row.get("confirm_channel"),
        )


def _route_dict(route: RouteInfo) -> dict[str, Any]:
    return asdict(route)


def payload_hash_of(input: dict[str, Any]) -> str:
    import hashlib
    import json

    return hashlib.sha256(
        json.dumps(input, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()


def _iso_now() -> str:
    return tokens.iso(datetime.now(timezone.utc))


def _estimate_cost(estimate: Any) -> float | None:
    """Extrae el coste estimado (credits o money_cents) de un estimate."""
    if isinstance(estimate, (int, float)):
        return float(estimate)
    if isinstance(estimate, dict):
        for key in ("credits", "money_cents", "cost"):
            if isinstance(estimate.get(key), (int, float)):
                return float(estimate[key])
    return None


def _estimate_unit(estimate: Any, cost_kind: str) -> str | None:
    if cost_kind == "credits":
        return "credits"
    if cost_kind == "money":
        return "money_cents"
    if isinstance(estimate, dict) and estimate.get("cost_unit") in ("credits", "money_cents"):
        return estimate["cost_unit"]
    return None


class AgentToolsService:
    def __init__(
        self,
        *,
        storage,
        registry: ToolRegistry,
        entitlement: EntitlementChecker | None = None,
        role: RoleChecker | None = None,
        policy: PolicyChecker | None = None,
        outbox_sink: audit_mod.AuditSink | None = None,
        app_key_default: str | None = None,
    ):
        self.storage = storage
        self.registry = registry
        self.entitlement = entitlement or StubEntitlement()  # deniega por defecto (§4)
        self.role = role or _AllowAll()
        self.policy = policy or _AllowAll()
        self.drainer = (
            audit_mod.OutboxDrainer(storage, outbox_sink) if outbox_sink is not None else None
        )
        self._app_key_default = app_key_default

    # ================================================================ §5

    def list_tools(self, *, org_id: str, user_id: str) -> dict:
        """GET /agent/tools — solo specs, sin previews ni inputs."""
        return {"tools": self.registry.list()}

    def create_proposal(
        self,
        *,
        tool: str,
        input: dict[str, Any],
        org_id: str,
        user_id: str,
        thread_id: str,
        plan_id: str | None = None,
        step: int | None = None,
        ttl_s: int = 300,
        route: RouteInfo | None = None,
        now: datetime | None = None,
    ) -> dict:
        """POST /agent/proposals → 201 {proposal}."""
        ts = now or datetime.now(timezone.utc)
        spec, impl = self.registry.get(tool)

        errors = self.registry.validate_input(tool, input)
        if errors:
            raise unprocessable(
                f"invalid input: {errors[0].code} {errors[0].message}", "invalid_input"
            )

        estimate = impl.estimate(input) if spec["cost"]["estimator"] else None
        preview = impl.preview(input) if impl.preview is not None else None

        # Escalado card→strong si el coste estimado supera el umbral de la org (§2).
        confirm_effective = spec["confirm"]
        if confirm_effective == "card":
            decision = self.entitlement.decide(
                org_id=org_id, app_key=spec["app_key"], user_id=user_id,
                tool_name=tool, effect=spec["effect"],
            )
            threshold = (
                decision.entitlement.cost_threshold if decision.entitlement else None
            )
            cost = _estimate_cost(estimate)
            if threshold and cost is not None:
                cap = (
                    threshold.credits
                    if spec["cost"]["kind"] == "credits"
                    else threshold.money_cents
                )
                if cap is not None and cost > cap:
                    confirm_effective = "strong"

        proposal = {
            "id": str(uuid.uuid4()),
            "tool": tool,
            "input": input,
            "payload_hash": payload_hash_of(input),
            "preview": preview,
            "estimate": estimate,
            "confirm_effective": confirm_effective,
            "state": "proposed",
            "created_at": tokens.iso(ts),
            "expires_at": tokens.iso(ts + timedelta(seconds=ttl_s)),
            "supersedes": None,
            "plan_id": plan_id,
            "step": step,
            "change_id": None,
            "org_id": org_id,
            "user_id": user_id,
            "thread_id": thread_id,
        }
        self.storage.insert_proposal(proposal)
        self.storage.insert_outbox_events(
            [
                self._event(
                    action="proposed", proposal=proposal, result="ok",
                    user_id=user_id, ts=tokens.iso(ts), route=route,
                )
            ]
        )
        self._drain()
        return {"proposal": proposal}

    def modify_proposal(
        self, proposal_id: str, *, new_input: dict[str, Any], actor_user_id: str,
        route: RouteInfo | None = None, now: datetime | None = None,
    ) -> dict:
        """POST /agent/proposals/{id}/modify → 201 {proposal} (supersedes)."""
        ts = now or datetime.now(timezone.utc)
        proposal = self._get_proposal(proposal_id)
        self._assert_actor(proposal, actor_user_id)
        self._assert_not_expired(proposal, ts, route=route)

        if not self.storage.cas_proposal_state(proposal_id, "proposed", {"state": "discarded"}):
            # ya no está proposed: o applied (409) o transición concurrente
            if proposal["state"] == "applied":
                raise conflict("proposal already applied", "proposal_applied")
            raise conflict("proposal not in proposed state", "invalid_transition")
        self.storage.insert_outbox_events(
            [self._event(action="discarded", proposal=proposal, result="ok", user_id=actor_user_id, route=route)]
        )
        self._drain()

        spec, impl = self.registry.get(proposal["tool"])
        errors = self.registry.validate_input(proposal["tool"], new_input)
        if errors:
            raise unprocessable(f"invalid input: {errors[0].code}", "invalid_input")

        estimate = impl.estimate(new_input) if spec["cost"]["estimator"] else None
        preview = impl.preview(new_input) if impl.preview is not None else None
        confirm_effective = spec["confirm"]
        if confirm_effective == "card":
            decision = self.entitlement.decide(
                org_id=proposal["org_id"], app_key=spec["app_key"], user_id=actor_user_id,
                tool_name=proposal["tool"], effect=spec["effect"],
            )
            threshold = decision.entitlement.cost_threshold if decision.entitlement else None
            cost = _estimate_cost(estimate)
            if threshold and cost is not None:
                cap = (
                    threshold.credits if spec["cost"]["kind"] == "credits" else threshold.money_cents
                )
                if cap is not None and cost > cap:
                    confirm_effective = "strong"

        new_proposal = {
            "id": str(uuid.uuid4()),
            "tool": proposal["tool"],
            "input": new_input,
            "payload_hash": payload_hash_of(new_input),
            "preview": preview,
            "estimate": estimate,
            "confirm_effective": confirm_effective,
            "state": "proposed",
            "created_at": tokens.iso(ts),
            "expires_at": proposal["expires_at"],
            "supersedes": proposal_id,
            "plan_id": proposal.get("plan_id"),
            "step": proposal.get("step"),
            "change_id": None,
            "org_id": proposal["org_id"],
            "user_id": proposal["user_id"],
            "thread_id": proposal["thread_id"],
        }
        self.storage.insert_proposal(new_proposal)
        self.storage.insert_outbox_events(
            [self._event(action="proposed", proposal=new_proposal, result="ok", user_id=actor_user_id, route=route)]
        )
        self._drain()
        return {"proposal": new_proposal}

    def accept_proposal(
        self,
        proposal_id: str,
        *,
        actor_user_id: str,
        context: str,
        ack: str | None = None,
        route: RouteInfo | None = None,
        now: datetime | None = None,
    ) -> dict:
        """POST /agent/proposals/{id}/accept → 200 {apply_token}.

        Capa 1 (entitlement) se comprueba aquí y se repite en apply (§4).
        Denegado → 403 + AuditEvent denied; la proposal no cambia de estado.
        """
        ts = now or datetime.now(timezone.utc)
        proposal = self._get_proposal(proposal_id)
        self._assert_actor(proposal, actor_user_id)
        spec, _ = self.registry.get(proposal["tool"])

        if context == "model_context":
            self._deny(proposal, actor_user_id, layer="token", code="model_context_apply", route=route)
            raise forbidden("model context cannot accept proposals", "model_context_apply")

        self._assert_not_expired(proposal, ts, route=route)
        if proposal["state"] != "proposed":
            raise conflict("proposal not in proposed state", "invalid_transition")

        # §4: la confirmación strong exige tip + ack del actor humano; un
        # apply_token nunca se emite sin el ack (tampoco sirve el de otro).
        if proposal["confirm_effective"] == "strong" and not ack:
            raise bad_request(
                "strong confirmation requires an explicit ack", "ack_required"
            )
        self._check_entitlement(proposal, spec, actor_user_id, route=route)

        if not self.storage.cas_proposal_state(proposal_id, "proposed", {"state": "accepted"}):
            raise conflict("proposal not in proposed state", "invalid_transition")

        token, row = tokens.issue_apply_token(
            proposal_id=proposal_id,
            payload_hash=proposal["payload_hash"],
            user_id=actor_user_id,
            org_id=proposal["org_id"],
            app_key=spec["app_key"],
            now=ts,
        )
        self.storage.insert_apply_token(row)
        self.storage.insert_outbox_events(
            [self._event(action="accepted", proposal=proposal, result="ok", user_id=actor_user_id, route=route)]
        )
        self._drain()
        return {"apply_token": token, "proposal_id": proposal_id}

    def apply_proposal(
        self,
        proposal_id: str,
        *,
        token: str,
        actor_user_id: str,
        context: str,
        ack: str | None = None,
        route: RouteInfo | None = None,
        now: datetime | None = None,
    ) -> dict:
        """POST /agent/proposals/{id}/apply → 200 {proposal, change_id}.

        Orden §4: contexto → token (con CAS) → entitlement → role → policy
        → re-check de coste → efecto → change+outbox mismo tx → CAS estado.
        """
        ts = now or datetime.now(timezone.utc)
        now_iso = tokens.iso(ts)
        proposal = self._get_proposal(proposal_id)
        spec, impl = self.registry.get(proposal["tool"])

        # §4: el contexto lo fija el servidor (cabecera), no el cliente.
        if context == "model_context":
            self._deny(proposal, actor_user_id, layer="token", code="model_context_apply", route=route)
            raise forbidden("model context cannot apply proposals", "model_context_apply")

        token_hash = tokens.hash_token(token)
        token_row = self.storage.get_apply_token(token_hash)

        # §4: «Aplicar dos veces la misma proposal con el mismo token: el
        # segundo devuelve el mismo change_id (200)». El token ya consumido
        # sobre un change existente es idempotente, no error.
        if token_row and token_row["consumed_at"]:
            change = self.storage.get_change_by_proposal(proposal_id)
            if change and change["applied_token_hash"] == token_hash:
                return {"proposal": self._get_proposal(proposal_id), "change_id": change["change_id"]}
            self._deny(proposal, actor_user_id, layer="token", code="token_already_used", route=route)
            raise forbidden("apply token already used", "token_already_used")

        # §4: irreversible exige la confirmación strong también en el apply.
        if proposal["confirm_effective"] == "strong" and not ack:
            raise bad_request(
                "strong confirmation requires an explicit ack", "ack_required"
            )
        self._validate_apply_token(token_row, proposal, spec, actor_user_id, ts, route=route)
        self._check_entitlement(proposal, spec, actor_user_id, route=route)
        self._check_role_and_policy(proposal, spec, actor_user_id, route=route)
        self._check_cost_reestimate(proposal, spec, impl)
        self._assert_not_expired(proposal, ts, route=route)
        if proposal["state"] != "accepted":
            raise conflict("proposal not in accepted state", "invalid_transition")

        # CAS: solo una llamada consume el token (§4 concurrencia).
        if not self.storage.consume_apply_token(token_hash, now_iso):
            self._deny(proposal, actor_user_id, layer="token", code="token_already_used", route=route)
            raise forbidden("apply token already used", "token_already_used")

        undo = spec["undo"]
        if undo["mode"] == "revert" and undo.get("grace_s", 0) > 0:
            # Gracia en el servidor: estado applied, efecto programado (§4).
            grace_job = {
                "job_id": str(uuid.uuid4()),
                "proposal_id": proposal_id,
                "run_at": tokens.iso(ts + timedelta(seconds=undo["grace_s"])),
                "status": "pending",
                "change_id": None,
                "created_at": now_iso,
                "route": _route_dict(route or RouteInfo()),
            }
            self.storage.insert_grace_job(grace_job)
            self.storage.cas_proposal_state(proposal_id, "accepted", {"state": "applied"})
            self._drain()
            return {
                "proposal": self._get_proposal(proposal_id),
                "change_id": None,
                "grace_until": grace_job["run_at"],
            }

        return self._execute_effect(proposal, spec, impl, token_hash, actor_user_id, ts, route=route)

    def discard_proposal(
        self, proposal_id: str, *, actor_user_id: str,
        route: RouteInfo | None = None, now: datetime | None = None,
    ) -> dict:
        """POST /agent/proposals/{id}/discard → 200.

        proposed/accepted → discarded. Si está applied dentro de la gracia,
        cancela el job pendiente: el efecto nunca se ejecuta (§4).
        """
        ts = now or datetime.now(timezone.utc)
        proposal = self._get_proposal(proposal_id)
        self._assert_actor(proposal, actor_user_id)

        if proposal["state"] in ("proposed", "accepted"):
            if not self.storage.cas_proposal_state(
                proposal_id, proposal["state"], {"state": "discarded"}
            ):
                raise conflict("proposal state changed", "invalid_transition")
            self.storage.insert_outbox_events(
                [self._event(action="discarded", proposal=proposal, result="ok", user_id=actor_user_id, route=route)]
            )
            self._drain()
            return {"proposal": self._get_proposal(proposal_id)}

        if proposal["state"] == "applied":
            job = self.storage.get_grace_job_by_proposal(proposal_id)
            if job and job["status"] == "pending" and job["run_at"] > tokens.iso(ts):
                # dentro de la gracia → cancelar el efecto programado
                if not self.storage.cas_grace_job_status(job["job_id"], "pending", {"status": "cancelled"}):
                    raise conflict("grace job already executed", "grace_expired")
                self.storage.cas_proposal_state(proposal_id, "applied", {"state": "discarded"})
                self.storage.insert_outbox_events(
                    [self._event(action="discarded", proposal=proposal, result="ok", user_id=actor_user_id, route=route)]
                )
                self._drain()
                return {"proposal": self._get_proposal(proposal_id), "grace_cancelled": True}
            raise gone("grace period expired", "grace_expired")

        raise conflict("proposal cannot be discarded", "invalid_transition")

    def create_revert_token(
        self, change_id: str, *, actor_user_id: str, org_id: str, now: datetime | None = None
    ) -> dict:
        """POST /agent/changes/{id}/revert-token → 200 {revert_token}."""
        ts = now or datetime.now(timezone.utc)
        change = self._get_change(change_id)
        if change["org_id"] != org_id:
            raise not_found("change not found", "change_not_found")  # §4 aislamiento
        if change["undo_mode"] != "revert":
            raise conflict("change is not revertible", "not_revertible")
        if change["state"] != "applied":
            raise conflict("change already undone", "invalid_transition")
        self._assert_undo_window(change, ts)
        token, row = tokens.issue_revert_token(
            change_id=change_id, user_id=actor_user_id, org_id=org_id, now=ts
        )
        self.storage.insert_revert_token(row)
        return {"revert_token": token}

    def revert_change(
        self, change_id: str, *, token: str, actor_user_id: str, context: str,
        route: RouteInfo | None = None, now: datetime | None = None,
    ) -> dict:
        """POST /agent/changes/{id}/revert → 200. Solo dentro de undo.window_s."""
        ts = now or datetime.now(timezone.utc)
        change = self._get_change(change_id)
        spec, impl = self.registry.get(change["tool"])
        if context == "model_context":
            raise forbidden("model context cannot revert changes", "model_context_apply")
        token_row = self.storage.get_revert_token(tokens.hash_token(token))
        if (
            not token_row
            or token_row["change_id"] != change_id
            or token_row["user_id"] != actor_user_id
            or token_row["org_id"] != change["org_id"]
            or token_row["consumed_at"]
            or token_row["expires_at"] <= tokens.iso(ts)
        ):
            raise forbidden("invalid or expired revert token", "invalid_or_expired_token")
        self._assert_undo_window(change, ts)
        if not self.storage.consume_revert_token(token_row["token_hash"], tokens.iso(ts)):
            raise forbidden("revert token already used", "token_already_used")

        impl.revert(change_id)
        self.storage.update_change_state(
            change_id,
            {"state": "reverted", "undone_at": tokens.iso(ts)},
            [
                self._event(
                    action="reverted", change=change, result="ok",
                    user_id=actor_user_id, ts=tokens.iso(ts), route=route,
                )
            ],
        )
        self._drain()
        return {"change": self.storage.get_change(change_id)}

    def compensate_change(
        self, change_id: str, *, actor_user_id: str, context: str,
        route: RouteInfo | None = None, now: datetime | None = None,
    ) -> dict:
        """POST /agent/changes/{id}/compensate → 200. Permitido tras la ventana."""
        ts = now or datetime.now(timezone.utc)
        change = self._get_change(change_id)
        spec, impl = self.registry.get(change["tool"])
        if context == "model_context":
            raise forbidden("model context cannot compensate changes", "model_context_apply")
        if change["undo_mode"] != "compensate":
            raise conflict("change is not compensable", "not_compensable")
        if change["state"] != "applied":
            raise conflict("change already undone", "invalid_transition")

        impl.compensate(change_id)
        self.storage.update_change_state(
            change_id,
            {"state": "compensated", "undone_at": tokens.iso(ts)},
            [
                self._event(
                    action="compensated", change=change, result="ok",
                    user_id=actor_user_id, ts=tokens.iso(ts), route=route,
                )
            ],
        )
        self._drain()
        return {"change": self.storage.get_change(change_id)}

    def list_proposals(self, *, thread_id: str, org_id: str) -> dict:
        """GET /agent/proposals?thread_id= — aisladas por org (§4)."""
        return {
            "proposals": [
                p for p in self.storage.list_proposals(thread_id) if p["org_id"] == org_id
            ]
        }

    # ============================================================ gracia

    def run_due_grace_jobs(self, *, now: datetime | None = None) -> int:
        """Ejecuta los efectos programados cuya gracia expiró. Devuelve cuántos."""
        ts = now or datetime.now(timezone.utc)
        ran = 0
        for job in self.storage.due_grace_jobs(tokens.iso(ts)):
            if not self.storage.cas_grace_job_status(job["job_id"], "pending", {"status": "running"}):
                continue
            proposal = self._get_proposal(job["proposal_id"])
            spec, impl = self.registry.get(proposal["tool"])
            result = self._execute_effect(
                proposal, spec, impl, applied_token_hash=None,
                actor_user_id=proposal["user_id"], ts=ts,
                route=RouteInfo.from_row(job.get("route")),
            )
            self.storage.cas_grace_job_status(
                job["job_id"], "running", {"status": "done", "change_id": result["change_id"]}
            )
            ran += 1
        return ran

    # ========================================================== internos

    def _execute_effect(self, proposal, spec, impl, applied_token_hash, actor_user_id, ts, route=None) -> dict:
        now_iso = tokens.iso(ts)
        change_id = impl.apply(proposal["input"], idempotency_key=proposal["id"])
        if not change_id:
            raise ContractError("apply_failed", "apply returned no change_id", 500)
        unit = _estimate_unit(proposal.get("estimate"), spec["cost"]["kind"])
        cost = _estimate_cost(proposal.get("estimate")) if unit else None
        change = {
            "change_id": change_id,
            "proposal_id": proposal["id"],
            "tool": proposal["tool"],
            "app_key": spec["app_key"],
            "org_id": proposal["org_id"],
            "user_id": proposal["user_id"],
            "payload_hash": proposal["payload_hash"],
            "applied_at": now_iso,
            "state": "applied",
            "undo_mode": spec["undo"]["mode"],
            "undo_window_s": spec["undo"]["window_s"],
            "undone_at": None,
            "cost_actual": cost,
            "cost_unit": unit,
            "applied_token_hash": applied_token_hash,
        }
        # §6: change + outbox en la MISMA transacción — el evento applied
        # nunca puede faltar si el efecto quedó registrado.
        if not self.storage.insert_change(
            change,
            [
                self._event(
                    action="applied", proposal=proposal, change=change,
                    result="ok", user_id=actor_user_id, ts=now_iso, route=route,
                )
            ],
        ):
            # idempotencia: otra llamada ya insertó el change de esta proposal
            existing = self.storage.get_change_by_proposal(proposal["id"])
            return {"proposal": self._get_proposal(proposal["id"]), "change_id": existing["change_id"]}
        self.storage.cas_proposal_state(
            proposal["id"], proposal["state"], {"state": "applied", "change_id": change_id}
        )
        self._drain()
        return {"proposal": self._get_proposal(proposal["id"]), "change_id": change_id}

    def _validate_apply_token(self, row, proposal, spec, actor_user_id, ts, route=None) -> None:
        """§4: un solo uso, ligado a proposal_id+payload_hash+user+org+app,
        TTL <=120 s. Cualquier fallo → 403 + audit denied layer=token."""
        ok = (
            row is not None
            and row["proposal_id"] == proposal["id"]
            and tokens.token_matches(row, field="payload_hash", expected=proposal["payload_hash"])
            and tokens.token_matches(row, field="user_id", expected=actor_user_id)
            and tokens.token_matches(row, field="org_id", expected=proposal["org_id"])
            and tokens.token_matches(row, field="app_key", expected=spec["app_key"])
            and row["expires_at"] > tokens.iso(ts)
        )
        if not ok:
            self._deny(proposal, actor_user_id, layer="token", code="invalid_or_expired_token", route=route)
            raise forbidden("invalid or expired apply token", "invalid_or_expired_token")

    def _check_entitlement(self, proposal, spec, actor_user_id, route=None) -> None:
        decision = self.entitlement.decide(
            org_id=proposal["org_id"], app_key=spec["app_key"], user_id=actor_user_id,
            tool_name=proposal["tool"], effect=spec["effect"],
        )
        if not decision.allowed:
            self._deny(
                proposal, actor_user_id, layer="entitlement", code=decision.reason or "denied", route=route
            )
            raise forbidden(decision.reason or "denied by entitlement", decision.reason or "entitlement_denied")

    def _check_role_and_policy(self, proposal, spec, actor_user_id, route=None) -> None:
        if not self.role.decide(
            org_id=proposal["org_id"], user_id=actor_user_id,
            tool_name=proposal["tool"], input=proposal["input"],
        ):
            self._deny(proposal, actor_user_id, layer="role", code="role_denied", route=route)
            raise forbidden("denied by role", "role_denied")
        if not self.policy.decide(
            org_id=proposal["org_id"], user_id=actor_user_id, toolspec=spec,
            preview=proposal.get("preview"), estimate=proposal.get("estimate"),
        ):
            self._deny(proposal, actor_user_id, layer="policy", code="policy_denied", route=route)
            raise forbidden("denied by policy", "policy_denied")

    def _check_cost_reestimate(self, proposal, spec, impl) -> None:
        """§4: el coste se re-evalúa en el apply. Si el estimador ahora
        escalaría card→strong (umbral org), la confirmación previa no vale
        → 409 cost_changed."""
        if not spec["cost"]["estimator"]:
            return
        new_estimate = impl.estimate(proposal["input"])
        old_cost = _estimate_cost(proposal.get("estimate"))
        new_cost = _estimate_cost(new_estimate)
        if new_cost is None or old_cost is None or new_cost <= old_cost:
            return
        # coste al alza: ¿cambiaría la confirmación efectiva?
        decision = self.entitlement.decide(
            org_id=proposal["org_id"], app_key=spec["app_key"], user_id=proposal["user_id"],
            tool_name=proposal["tool"], effect=spec["effect"],
        )
        threshold = decision.entitlement.cost_threshold if decision.entitlement else None
        cap = None
        if threshold:
            cap = (
                threshold.credits if spec["cost"]["kind"] == "credits" else threshold.money_cents
            )
        escalates = cap is not None and old_cost <= cap < new_cost
        if escalates or proposal["confirm_effective"] != spec["confirm"]:
            raise conflict(
                "cost estimate increased; confirmation must be renewed", "cost_changed"
            )

    def _assert_undo_window(self, change, ts) -> None:
        applied = tokens.parse_iso(change["applied_at"])
        deadline = applied + timedelta(seconds=change["undo_window_s"])
        if ts > deadline:
            raise gone("undo window expired", "undo_window_expired")

    def _assert_not_expired(self, proposal, ts, route=None) -> None:
        if proposal["expires_at"] <= tokens.iso(ts):
            # §3: transición pasiva → expired + audit
            self.storage.cas_proposal_state(proposal["id"], proposal["state"], {"state": "expired"})
            self.storage.insert_outbox_events(
                [self._event(action="expired", proposal=proposal, result="ok", user_id=proposal["user_id"], route=route)]
            )
            self._drain()
            raise gone("proposal expired", "proposal_expired")

    def _get_proposal(self, proposal_id: str) -> dict:
        proposal = self.storage.get_proposal(proposal_id)
        if not proposal:
            raise not_found("proposal not found", "proposal_not_found")
        return proposal

    def _get_change(self, change_id: str) -> dict:
        change = self.storage.get_change(change_id)
        if not change:
            raise not_found("change not found", "change_not_found")
        return change

    def _assert_actor(self, proposal, actor_user_id) -> None:
        if proposal["user_id"] != actor_user_id:
            raise forbidden("actor does not own this proposal", "forbidden")

    def _event(self, *, action, result, user_id, proposal=None, change=None, ts=None, error_code=None, route=None):
        base = proposal or {}
        ch = change or {}
        estimate = base.get("estimate")
        spec = self.registry.get(base.get("tool") or ch.get("tool"))[0]
        # §6: cost_unit es obligatorio y no nulo; con coste cero se emite la
        # unidad nominal del kind (o credits si no hay coste).
        cost_unit = (
            ch.get("cost_unit")
            or _estimate_unit(estimate, spec["cost"]["kind"])
            or "credits"
        )
        rt = route or RouteInfo()
        return audit_mod.build_audit_event(
            ts=ts or _iso_now(),
            org_id=base.get("org_id") or ch.get("org_id"),
            app_key=ch.get("app_key") or self.registry.get(base["tool"])[0]["app_key"],
            user_id=user_id,
            tool=base.get("tool") or ch.get("tool"),
            proposal_id=base.get("id") or ch.get("proposal_id"),
            change_id=ch.get("change_id") or base.get("change_id"),
            payload_hash=base.get("payload_hash") or ch.get("payload_hash"),
            action=action,
            via=rt.via,
            client_id=rt.client_id,
            client_verified=rt.client_verified,
            confirm_channel=rt.confirm_channel,
            confirm_effective=base.get("confirm_effective") or "none",
            denied_layer=None,
            cost_estimate=_estimate_cost(estimate) or 0.0,
            cost_actual=ch.get("cost_actual"),
            cost_unit=cost_unit,
            result=result,
            error_code=error_code,
        )

    def _deny(self, proposal, user_id, *, layer, code, route=None) -> None:
        """§4: cada negación produce un AuditEvent denied con denied_layer."""
        self.storage.insert_outbox_events(
            [
                {
                    **self._event(
                        action="denied", proposal=proposal, result="error",
                        user_id=user_id, ts=None, error_code=code, route=route,
                    ),
                    "denied_layer": layer,
                }
            ]
        )
        self._drain()

    def _drain(self) -> None:
        if self.drainer is None:
            return
        try:
            self.drainer.drain(now_iso=_iso_now())
        except Exception:
            # §6: sink caído → eventos quedan en outbox; la operación no falla.
            pass
