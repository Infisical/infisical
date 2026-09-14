import crypto from "node:crypto";

import { AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";

export const AGENT_VAULT_SESSION_TOKEN_PREFIX = "agv_";

export const hashSessionToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** sha256, not bcrypt: the token is the lookup key. It is never stored and comes back exactly once. */
export const generateSessionToken = () => {
  const token = `${AGENT_VAULT_SESSION_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashSessionToken(token) };
};

// The actor columns are SET NULL when the owner is deleted, so the row outlives them. Resolve refuses such
// a session; the status says the same, or the list would show it Active with nobody left to revoke it.
export const isOwnerlessSession = (session: { userId?: string | null; identityId?: string | null }) =>
  !session.userId && !session.identityId;

export const deriveSessionStatus = (
  session: { expiresAt: Date | null; revokedAt: Date | null; userId?: string | null; identityId?: string | null },
  now = new Date()
): AgentVaultSessionStatus => {
  if (session.revokedAt || isOwnerlessSession(session)) return AgentVaultSessionStatus.Revoked;
  if (session.expiresAt && session.expiresAt <= now) return AgentVaultSessionStatus.Expired;
  return AgentVaultSessionStatus.Active;
};
