import crypto from "node:crypto";

import { AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";

export const AGENT_VAULT_SESSION_TOKEN_PREFIX = "agv_";

export const hashSessionToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * The token is the lookup key, so it is hashed with sha256 rather than bcrypt: bcrypt is for when you
 * already know which row to check. The token itself is never stored and is returned exactly once.
 */
export const generateSessionToken = () => {
  const token = `${AGENT_VAULT_SESSION_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashSessionToken(token) };
};

export const deriveSessionStatus = (
  session: { expiresAt: Date | null; revokedAt: Date | null },
  now = new Date()
): AgentVaultSessionStatus => {
  if (session.revokedAt) return AgentVaultSessionStatus.Revoked;
  if (session.expiresAt && session.expiresAt <= now) return AgentVaultSessionStatus.Expired;
  return AgentVaultSessionStatus.Active;
};

/** sha256 of the ordered connection ids a resolve returned; only used to decide whether to audit. */
export const hashResolvedConnectionIds = (connectionIds: string[]) =>
  crypto.createHash("sha256").update(connectionIds.join(",")).digest("hex");
