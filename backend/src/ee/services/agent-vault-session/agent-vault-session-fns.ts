import crypto from "node:crypto";

import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";

export const AGENT_VAULT_SESSION_TOKEN_PREFIX = "agv_";

export const hashSessionToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** sha256, not bcrypt: the token is the lookup key. It is never stored and comes back exactly once. */
export const generateSessionToken = () => {
  const token = `${AGENT_VAULT_SESSION_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashSessionToken(token) };
};

type TSessionOwnerColumns = {
  userId?: string | null;
  identityId?: string | null;
  actingIdentityId?: string | null;
  actingIdentityName?: string | null;
};

// The actor columns are SET NULL when the owner is deleted, so the row outlives them, and an on-behalf-of session
// keeps its acting identity's name once that identity is deleted. Resolve refuses either; the status says the same,
// or the list would show it Active when nothing can use it.
export const isOrphanedSession = (session: TSessionOwnerColumns) =>
  (!session.userId && !session.identityId) || (Boolean(session.actingIdentityName) && !session.actingIdentityId);

// The machine identity that started a session on a user's behalf holds it alongside the user.
export const isSessionOwnedBy = (ctx: { actor: ActorType; actorId: string }, session: TSessionOwnerColumns) =>
  (ctx.actor === ActorType.USER && session.userId === ctx.actorId) ||
  (ctx.actor === ActorType.IDENTITY &&
    (session.identityId === ctx.actorId || session.actingIdentityId === ctx.actorId));

export const deriveSessionStatus = (
  session: { expiresAt: Date | null; revokedAt: Date | null } & TSessionOwnerColumns,
  now = new Date()
): AgentVaultSessionStatus => {
  if (session.revokedAt || isOrphanedSession(session)) return AgentVaultSessionStatus.Revoked;
  if (session.expiresAt && session.expiresAt <= now) return AgentVaultSessionStatus.Expired;
  return AgentVaultSessionStatus.Active;
};
