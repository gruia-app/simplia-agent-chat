"""Tokens de aplicación y de revert (§4).

- Un solo uso, ligados a (proposal_id, payload_hash, user_id, org_id,
  app_key) — apply — o a change_id — revert — con TTL <= 120 s.
- El servidor guarda solo sha256(token), lo compara en tiempo constante y
  lo consume de forma atómica (CAS en el storage).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

APPLY_TOKEN_TTL_S = 120
REVERT_TOKEN_TTL_S = 120


def _now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_apply_token(
    *,
    proposal_id: str,
    payload_hash: str,
    user_id: str,
    org_id: str,
    app_key: str,
    now: datetime | None = None,
    ttl_s: int = APPLY_TOKEN_TTL_S,
) -> tuple[str, dict]:
    """Devuelve (token_plano, fila_para_storage). El plano nunca se guarda."""
    if ttl_s > APPLY_TOKEN_TTL_S:
        raise ValueError("apply token ttl must be <= 120s (SPEC §4)")
    issued = now or _now()
    token = secrets.token_urlsafe(32)
    row = {
        "token_hash": hash_token(token),
        "proposal_id": proposal_id,
        "payload_hash": payload_hash,
        "user_id": user_id,
        "org_id": org_id,
        "app_key": app_key,
        "issued_at": iso(issued),
        "expires_at": iso(issued + timedelta(seconds=ttl_s)),
        "consumed_at": None,
    }
    return token, row


def issue_revert_token(
    *,
    change_id: str,
    user_id: str,
    org_id: str,
    now: datetime | None = None,
    ttl_s: int = REVERT_TOKEN_TTL_S,
) -> tuple[str, dict]:
    if ttl_s > REVERT_TOKEN_TTL_S:
        raise ValueError("revert token ttl must be <= 120s (SPEC §4)")
    issued = now or _now()
    token = secrets.token_urlsafe(32)
    row = {
        "token_hash": hash_token(token),
        "change_id": change_id,
        "user_id": user_id,
        "org_id": org_id,
        "issued_at": iso(issued),
        "expires_at": iso(issued + timedelta(seconds=ttl_s)),
        "consumed_at": None,
    }
    return token, row


def token_matches(row: dict, *, field: str, expected: str) -> bool:
    """Comparación en tiempo constante para los campos ligados al token."""
    return hmac.compare_digest(str(row.get(field) or ""), expected)
