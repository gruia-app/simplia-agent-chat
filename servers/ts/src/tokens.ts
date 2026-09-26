/** Tokens de aplicación y de revert (§4).
 *
 * - Un solo uso, ligados a (proposal_id, payload_hash, user_id, org_id,
 *   app_key) — apply — o a change_id — revert — con TTL <= 120 s.
 * - El servidor guarda solo sha256(token), lo compara en tiempo constante
 *   y lo consume de forma atómica (CAS en el storage).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const APPLY_TOKEN_TTL_S = 120;
export const REVERT_TOKEN_TTL_S = 120;

export interface ApplyTokenRow {
  token_hash: string;
  proposal_id: string;
  payload_hash: string;
  user_id: string;
  org_id: string;
  app_key: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface RevertTokenRow {
  token_hash: string;
  change_id: string;
  user_id: string;
  org_id: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoPlus(fromIso: string, seconds: number): string {
  return new Date(Date.parse(fromIso) + seconds * 1000).toISOString();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function compareSafe(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function tokenMatches(row: Record<string, unknown>, field: string, expected: string): boolean {
  const actual = row[field];
  return typeof actual === "string" && compareSafe(actual, expected);
}

export function issueApplyToken(params: {
  proposalId: string;
  payloadHash: string;
  userId: string;
  orgId: string;
  appKey: string;
  now?: string;
  ttlS?: number;
}): { token: string; row: ApplyTokenRow } {
  const ttl = params.ttlS ?? APPLY_TOKEN_TTL_S;
  if (ttl > APPLY_TOKEN_TTL_S) {
    throw new Error("apply token ttl must be <= 120s (SPEC §4)");
  }
  const issued = params.now ?? isoNow();
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    row: {
      token_hash: hashToken(token),
      proposal_id: params.proposalId,
      payload_hash: params.payloadHash,
      user_id: params.userId,
      org_id: params.orgId,
      app_key: params.appKey,
      issued_at: issued,
      expires_at: isoPlus(issued, ttl),
      consumed_at: null,
    },
  };
}

export function issueRevertToken(params: {
  changeId: string;
  userId: string;
  orgId: string;
  now?: string;
  ttlS?: number;
}): { token: string; row: RevertTokenRow } {
  const ttl = params.ttlS ?? REVERT_TOKEN_TTL_S;
  if (ttl > REVERT_TOKEN_TTL_S) {
    throw new Error("revert token ttl must be <= 120s (SPEC §4)");
  }
  const issued = params.now ?? isoNow();
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    row: {
      token_hash: hashToken(token),
      change_id: params.changeId,
      user_id: params.userId,
      org_id: params.orgId,
      issued_at: issued,
      expires_at: isoPlus(issued, ttl),
      consumed_at: null,
    },
  };
}
