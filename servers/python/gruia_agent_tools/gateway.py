"""Modo delegado del gateway (SPEC-CHAT-F1-R687 rev 5 §9.3–§9.4).

- El sujeto viaja en una aserción firmada por el kernel: JWT con
  `aud=app_key`, `exp-iat <= 60 s`, `jti` de un solo uso (guardado en el
  storage durante el exp), `sub`, `org`, `mcp_token_id`, `scopes`,
  `client_id`, `client_verified`.
- El token de servicio autentica el canal y NUNCA basta por sí solo; sin
  aserción → 401. jti repetido → 401.
- Herramientas de sistema `<app_key>__proposal__apply|revert|get`: el ns
  `proposal` está reservado.
- Las escrituras por MCP solo crean proposals y devuelven ProposalRef;
  `apply`/`revert` ejecutan por elicitation únicamente si se cumplen TODAS
  las condiciones de §9.3; en cualquier otro caso devuelven `review_url`
  (sin token) sin ejecutar.
- `get`, `apply` y `revert` exigen mismo user_id, org_id y app_key; si no,
  404 (anti-IDOR).
- CLI (§9.5): con `via="cli"` apply/revert exigen confirmación TTY
  (`cli_tty_confirmed`) y solo lo reversible con card; todo lo demás
  devuelve `review_url`. No existe flag `--yes` ni equivalente.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

import jwt

from .errors import bad_request, forbidden, not_found, unauthorized
from .mcp import from_mcp_name
from .service import AgentToolsService, RouteInfo
from . import tokens

ASSERTION_MAX_LIFETIME_S = 60
REQUIRED_ASSERTION_CLAIMS = (
    "exp", "iat", "jti", "sub", "org", "mcp_token_id", "scopes",
    "client_id", "client_verified",
)


@dataclass(frozen=True)
class DelegatedAssertion:
    user_id: str
    org_id: str
    mcp_token_id: str
    scopes: frozenset[str]
    client_id: str
    client_verified: bool
    jti: str


def cli_apply_allowed(effect: str, confirm_effective: str, is_tty: bool) -> bool:
    """§9.5: por la CLI solo se aplica lo reversible con `card` y solo si
    stdin y stdout son TTY. No existe flag `--yes` ni equivalente: la
    firma de esta función no admite bypass."""
    return effect == "reversible" and confirm_effective == "card" and is_tty


def jwks_resolver_from_document(jwks: dict[str, Any]) -> Callable[[str | None], Any]:
    """Resolver §9.4 a partir de un documento JWKS `{keys: [...]}`: busca
    la clave pública por `kid`. Levanta KeyError si el kid no está."""
    keys = [k for k in (jwks or {}).get("keys") or [] if isinstance(k, dict)]

    def resolve(kid: str | None) -> Any:
        for jwk in keys:
            if jwk.get("kid") == kid or (kid is None and len(keys) == 1):
                return jwk
        raise KeyError(f"kid {kid!r} not in JWKS")

    return resolve


class DelegatedGateway:
    """Punto de entrada del lado de la app para llamadas delegadas MCP."""

    def __init__(
        self,
        service: AgentToolsService,
        *,
        app_key: str,
        jwks_resolver: Callable[[str | None], Any],
        service_token_verifier: Callable[[str], bool] | None = None,
        verified_clients: frozenset[str] | set[str] = frozenset(),
        review_url_template: str = "/agent/proposals/{proposal_id}",
        elicit: Callable[[dict[str, Any]], str] | None = None,
    ):
        """jwks_resolver(kid) -> clave PEM/objeto/JWK-dict con el que
        verificar la aserción (ver `jwks_resolver_from_document`).
        elicit(proposal) -> 'accept'|'decline'|'cancel' implementa
        `elicitation/create` del cliente MCP; None equivale a no disponible
        (→ review_url). verified_clients: allowlist de client_id."""
        self.service = service
        self.app_key = app_key
        self._jwks_resolver = jwks_resolver
        self._service_token_verifier = service_token_verifier or (lambda _: False)
        self._verified_clients = set(verified_clients)
        self._review_url_template = review_url_template
        self._elicit = elicit

    # ------------------------------------------------------------ §9.4

    def verify_assertion(
        self, *, assertion: str | None, service_token: str | None, now: datetime | None = None
    ) -> DelegatedAssertion:
        """Verifica canal (token de servicio) + sujeto (aserción firmada).
        Cualquier fallo → 401."""
        if not service_token or not self._service_token_verifier(service_token):
            raise unauthorized("service token missing or invalid", "invalid_service_token")
        if not assertion:
            raise unauthorized("delegated assertion required", "assertion_required")
        ts = now or datetime.now(timezone.utc)
        try:
            header = jwt.get_unverified_header(assertion)
            key = self._jwks_resolver(header.get("kid"))
            if isinstance(key, dict) and key.get("kty"):
                key = jwt.PyJWK(key).key
            claims = jwt.decode(
                assertion,
                key=key,
                algorithms=["RS256", "ES256"],
                audience=self.app_key,
                options={
                    "require": list(REQUIRED_ASSERTION_CLAIMS),
                    "verify_aud": True,
                    "verify_exp": True,
                    "verify_iat": True,
                },
            )
        except Exception as exc:
            raise unauthorized(f"invalid assertion: {type(exc).__name__}", "invalid_assertion")
        if int(claims["exp"]) - int(claims["iat"]) > ASSERTION_MAX_LIFETIME_S:
            raise unauthorized("assertion lifetime exceeds 60s", "invalid_assertion")
        if claims["exp"] <= int(ts.timestamp()):
            raise unauthorized("assertion expired", "invalid_assertion")
        if not isinstance(claims.get("scopes"), list) or not claims["scopes"]:
            raise unauthorized("assertion missing scopes", "invalid_assertion")
        # jti de un solo uso: insertar devuelve False si ya existía (replay).
        if not self.service.storage.insert_gateway_jti(
            claims["jti"], tokens.iso(datetime.fromtimestamp(claims["exp"], timezone.utc))
        ):
            raise unauthorized("assertion jti already used", "assertion_replayed")
        return DelegatedAssertion(
            user_id=claims["sub"],
            org_id=claims["org"],
            mcp_token_id=claims["mcp_token_id"],
            scopes=frozenset(claims["scopes"]),
            client_id=claims["client_id"],
            client_verified=bool(claims["client_verified"]),
            jti=claims["jti"],
        )

    # ------------------------------------------------------------ §9.2

    def call_tool(
        self,
        mcp_name: str,
        arguments: dict[str, Any] | None = None,
        *,
        assertion: str | None,
        service_token: str | None,
        thread_id: str | None = None,
        via: str = "mcp",
        cli_tty_confirmed: bool = False,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        """tools/call delegado: escrituras crean Proposal (→ ProposalRef),
        lecturas ejecutan la implementación read/preview. `via` es el
        canal (§9.6): "mcp" o "cli"; en "cli" apply/revert siguen §9.5."""
        if via not in ("mcp", "cli"):
            raise bad_request(f"unknown via {via!r}", "invalid_via")
        subject = self.verify_assertion(assertion=assertion, service_token=service_token, now=now)
        try:
            parts = from_mcp_name(mcp_name)
        except ValueError:
            raise not_found("unknown tool", "unknown_tool")
        if parts["app_key"] != self.app_key:
            raise not_found("unknown tool", "unknown_tool")
        self._require_scope(subject, f"app:{self.app_key}")
        self._check_mcp_access(subject)

        route = RouteInfo(
            via=via,
            client_id=subject.client_id,
            client_verified=subject.client_verified,
        )
        if parts["ns"] == "proposal":
            return self._system_tool(
                parts["verb"], subject, route, arguments or {},
                cli_tty_confirmed=cli_tty_confirmed, now=now,
            )

        tool_name = f"{parts['ns']}.{parts['verb']}"
        spec, impl = self.service.registry.get(tool_name)
        if spec["app_key"] != self.app_key:
            raise not_found("unknown tool", "unknown_tool")
        self._require_scope(subject, f"tool:{tool_name}", wildcard="tool:*")

        if spec["effect"] == "read":
            run = getattr(impl, "read", None) or getattr(impl, "preview", None)
            if run is None:
                raise forbidden("tool has no read implementation", "no_read_impl")
            return {"result": run(arguments or {})}

        # §9.2: las escrituras por MCP nunca aplican — crean Proposal.
        result = self.service.create_proposal(
            tool=tool_name,
            input=arguments or {},
            org_id=subject.org_id,
            user_id=subject.user_id,
            thread_id=thread_id or f"{via}:{subject.mcp_token_id}",
            route=route,
            now=now,
        )
        proposal = result["proposal"]
        return {
            "structuredContent": {
                "proposal_id": proposal["id"],
                "tool": proposal["tool"],
                "diff": proposal.get("preview"),
                "estimate": proposal.get("estimate"),
                "confirm_effective": proposal["confirm_effective"],
                "effect": spec["effect"],
                "expires_at": proposal["expires_at"],
                "review_url": self._review_url(proposal["id"]),
            }
        }

    # ------------------------------------------------------------ §9.3

    def _system_tool(
        self,
        verb: str,
        subject: DelegatedAssertion,
        route: RouteInfo,
        arguments: dict[str, Any],
        *,
        cli_tty_confirmed: bool = False,
        now: datetime | None,
    ) -> dict[str, Any]:
        if verb == "get":
            proposal = self._proposal_for_subject(arguments.get("proposal_id"), subject)
            return {"proposal": proposal}
        if verb == "apply":
            proposal = self._proposal_for_subject(arguments.get("proposal_id"), subject)
            if route.via == "cli":
                return self._apply_via_cli(proposal, subject, route, cli_tty_confirmed, now=now)
            if not self._elicitation_allowed(proposal, subject):
                return {"review_url": self._review_url(proposal["id"])}
            return self._apply_via_elicitation(proposal, subject, route, now=now)
        if verb == "revert":
            change = self._change_for_subject(arguments.get("change_id"), subject)
            if route.via == "cli":
                return self._revert_via_cli(change, subject, route, cli_tty_confirmed, now=now)
            if not self._elicitation_allowed_for_change(change, subject):
                return {"review_url": self._review_url(change["proposal_id"])}
            return self._revert_via_elicitation(change, subject, route, now=now)
        raise not_found("unknown system tool", "unknown_tool")

    def _proposal_for_subject(self, proposal_id: str | None, subject: DelegatedAssertion) -> dict:
        """Anti-IDOR §9.3: cualquier desajuste de user/org/app → 404."""
        proposal = self.service.storage.get_proposal(proposal_id or "")
        if not proposal:
            raise not_found("proposal not found", "proposal_not_found")
        spec, _ = self.service.registry.get(proposal["tool"])
        if (
            proposal["user_id"] != subject.user_id
            or proposal["org_id"] != subject.org_id
            or spec["app_key"] != self.app_key
        ):
            raise not_found("proposal not found", "proposal_not_found")
        self._require_scope(subject, f"tool:{proposal['tool']}", wildcard="tool:*")
        return proposal

    def _change_for_subject(self, change_id: str | None, subject: DelegatedAssertion) -> dict:
        change = self.service.storage.get_change(change_id or "")
        if not change:
            raise not_found("change not found", "change_not_found")
        if (
            change["user_id"] != subject.user_id
            or change["org_id"] != subject.org_id
            or change["app_key"] != self.app_key
        ):
            raise not_found("change not found", "change_not_found")
        self._require_scope(subject, f"tool:{change['tool']}", wildcard="tool:*")
        return change

    def _elicitation_allowed(self, proposal: dict, subject: DelegatedAssertion) -> bool:
        """§9.3: apply por elicitation solo si TODAS las condiciones:
        reversible + confirm_effective=card + org lo tiene activado +
        client_id verificado en allowlist + elicitation disponible."""
        spec, _ = self.service.registry.get(proposal["tool"])
        if spec["effect"] != "reversible" or proposal["confirm_effective"] != "card":
            return False
        if not self._org_elicitation_enabled(proposal["org_id"], spec["app_key"]):
            return False
        if not subject.client_verified or subject.client_id not in self._verified_clients:
            return False
        return self._elicit is not None

    def _elicitation_allowed_for_change(self, change: dict, subject: DelegatedAssertion) -> bool:
        if change["undo_mode"] != "revert" or change["state"] != "applied":
            return False
        if not self._org_elicitation_enabled(change["org_id"], change["app_key"]):
            return False
        if not subject.client_verified or subject.client_id not in self._verified_clients:
            return False
        return self._elicit is not None

    def _org_elicitation_enabled(self, org_id: str, app_key: str) -> bool:
        """La organización debe tener el apply por elicitation activado
        (por defecto no). Vive en la fila de entitlement §8."""
        decision = self.service.entitlement.decide(
            org_id=org_id, app_key=app_key, user_id="", tool_name="*", effect="read"
        )
        return bool(decision.entitlement and decision.entitlement.elicitation_apply)

    def _apply_via_elicitation(
        self, proposal: dict, subject: DelegatedAssertion, route: RouteInfo, *, now
    ) -> dict[str, Any]:
        if self._elicit(proposal) != "accept":
            return {"review_url": self._review_url(proposal["id"])}
        route = RouteInfo(
            via=route.via,
            client_id=subject.client_id,
            client_verified=subject.client_verified,
            confirm_channel="elicitation",
        )
        accepted = self.service.accept_proposal(
            proposal["id"],
            actor_user_id=subject.user_id,
            context="user_confirmed",
            route=route,
            now=now,
        )
        return self.service.apply_proposal(
            proposal["id"],
            token=accepted["apply_token"],
            actor_user_id=subject.user_id,
            context="user_confirmed",
            route=route,
            now=now,
        )

    def _revert_via_elicitation(
        self, change: dict, subject: DelegatedAssertion, route: RouteInfo, *, now
    ) -> dict[str, Any]:
        if self._elicit({"change_id": change["change_id"], "tool": change["tool"]}) != "accept":
            return {"review_url": self._review_url(change["proposal_id"])}
        route = RouteInfo(
            via=route.via,
            client_id=subject.client_id,
            client_verified=subject.client_verified,
            confirm_channel="elicitation",
        )
        issued = self.service.create_revert_token(
            change["change_id"],
            actor_user_id=subject.user_id,
            org_id=subject.org_id,
            now=now,
        )
        return self.service.revert_change(
            change["change_id"],
            token=issued["revert_token"],
            actor_user_id=subject.user_id,
            context="user_confirmed",
            route=route,
            now=now,
        )

    def _apply_via_cli(
        self, proposal: dict, subject: DelegatedAssertion, route: RouteInfo,
        tty_confirmed: bool, *, now,
    ) -> dict[str, Any]:
        """§9.5: la CLI solo aplica lo reversible con card y solo con TTY;
        en cualquier otro caso devuelve review_url sin ejecutar."""
        spec, _ = self.service.registry.get(proposal["tool"])
        if not cli_apply_allowed(spec["effect"], proposal["confirm_effective"], tty_confirmed):
            return {"review_url": self._review_url(proposal["id"])}
        confirmed = RouteInfo(
            via="cli",
            client_id=subject.client_id,
            client_verified=subject.client_verified,
            confirm_channel="cli_tty",
        )
        accepted = self.service.accept_proposal(
            proposal["id"],
            actor_user_id=subject.user_id,
            context="user_confirmed",
            route=confirmed,
            now=now,
        )
        return self.service.apply_proposal(
            proposal["id"],
            token=accepted["apply_token"],
            actor_user_id=subject.user_id,
            context="user_confirmed",
            route=confirmed,
            now=now,
        )

    def _revert_via_cli(
        self, change: dict, subject: DelegatedAssertion, route: RouteInfo,
        tty_confirmed: bool, *, now,
    ) -> dict[str, Any]:
        """§9.5: revert por la CLI solo con TTY y modo revert; si no,
        review_url."""
        if not tty_confirmed or change["undo_mode"] != "revert" or change["state"] != "applied":
            return {"review_url": self._review_url(change["proposal_id"])}
        confirmed = RouteInfo(
            via="cli",
            client_id=subject.client_id,
            client_verified=subject.client_verified,
            confirm_channel="cli_tty",
        )
        issued = self.service.create_revert_token(
            change["change_id"],
            actor_user_id=subject.user_id,
            org_id=subject.org_id,
            now=now,
        )
        return self.service.revert_change(
            change["change_id"],
            token=issued["revert_token"],
            actor_user_id=subject.user_id,
            context="user_confirmed",
            route=confirmed,
            now=now,
        )

    # ------------------------------------------------------------ internos

    def _review_url(self, proposal_id: str) -> str:
        """§9.2: SOLO el proposal_id en la URL — nunca un token."""
        return self._review_url_template.format(proposal_id=proposal_id)

    def _require_scope(self, subject: DelegatedAssertion, scope: str, wildcard: str | None = None) -> None:
        if scope in subject.scopes or (wildcard and wildcard in subject.scopes):
            return
        raise forbidden(f"missing scope {scope}", "scope_denied")

    def _check_mcp_access(self, subject: DelegatedAssertion) -> None:
        """§9.4: entitlement `mcp_access` además de los scopes OAuth."""
        decision = self.service.entitlement.decide(
            org_id=subject.org_id,
            app_key=self.app_key,
            user_id=subject.user_id,
            tool_name="*",
            effect="read",
        )
        if not decision.entitlement or not decision.entitlement.mcp_access:
            raise forbidden("org lacks mcp_access entitlement", "mcp_access_denied")


def issue_test_assertion(
    *,
    private_key: Any,
    app_key: str,
    sub: str,
    org: str,
    mcp_token_id: str = "mtok-1",
    scopes: list[str] | None = None,
    client_id: str = "cli-mcp-1",
    client_verified: bool = True,
    jti: str | None = None,
    lifetime_s: int = 60,
    now: datetime | None = None,
    kid: str | None = "test-key",
) -> str:
    """Helper de tests: firma una aserción con la forma exacta de §9.4."""
    ts = now or datetime.now(timezone.utc)
    iat = int(ts.timestamp())
    payload = {
        "iss": "kernel",
        "aud": app_key,
        "iat": iat,
        "exp": iat + lifetime_s,
        "jti": jti or str(uuid.uuid4()),
        "sub": sub,
        "org": org,
        "mcp_token_id": mcp_token_id,
        "scopes": scopes or [],
        "client_id": client_id,
        "client_verified": client_verified,
    }
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": kid})
