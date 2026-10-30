import crypto from "node:crypto";

import RE2 from "re2";
import { z } from "zod";

import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultMemberType, AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";
import { TAgentVaultSessionActor } from "./agent-vault-session-types";

export const AGENT_VAULT_SESSION_TOKEN_PREFIX = "agv_";

export const AGENT_VAULT_SESSION_LABEL_MAX_LENGTH = 128;

// Controls, format characters (zero-width spaces, text-direction overrides), private-use characters and
// line or paragraph separators either render as nothing or reorder what is shown, so a stored label could
// read differently from what search matches. RE2 sees a lone surrogate only after it becomes U+FFFD, so
// isWellFormed catches that case.
const AGENT_VAULT_SESSION_LABEL_DISALLOWED_RE = new RE2(/[\p{Cc}\p{Cf}\p{Co}\p{Zl}\p{Zp}]/u);

export const AGENT_VAULT_SESSION_LABEL_MESSAGE =
  "A label can't contain line breaks, tabs, or invisible characters such as zero-width spaces or text direction marks.";

export const isValidAgentVaultSessionLabel = (label: string) =>
  label.isWellFormed() && !AGENT_VAULT_SESSION_LABEL_DISALLOWED_RE.test(label);

const agentVaultSessionLabelStringSchema = z
  .string()
  .trim()
  .max(
    AGENT_VAULT_SESSION_LABEL_MAX_LENGTH,
    `A label can be at most ${AGENT_VAULT_SESSION_LABEL_MAX_LENGTH} characters`
  )
  .refine(isValidAgentVaultSessionLabel, AGENT_VAULT_SESSION_LABEL_MESSAGE);

// Null and a blank string both mean no label, so a client can send back what a read returned.
export const agentVaultSessionLabelSchema = agentVaultSessionLabelStringSchema
  .nullish()
  .transform((label) => label || null);

// Required on update: the label is the only field, so leaving it out must not read as clearing it.
export const agentVaultSessionLabelUpdateSchema = agentVaultSessionLabelStringSchema
  .nullable()
  .transform((label) => label || null);

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

export const isSessionOwnedBy = (
  ctx: { actor: ActorType; actorId: string },
  session: { userId?: string | null; identityId?: string | null }
) =>
  (ctx.actor === ActorType.USER && session.userId === ctx.actorId) ||
  (ctx.actor === ActorType.IDENTITY && session.identityId === ctx.actorId);

export const deriveSessionStatus = (
  session: { expiresAt: Date | null; revokedAt: Date | null; userId?: string | null; identityId?: string | null },
  now = new Date()
): AgentVaultSessionStatus => {
  if (session.revokedAt || isOwnerlessSession(session)) return AgentVaultSessionStatus.Revoked;
  if (session.expiresAt && session.expiresAt <= now) return AgentVaultSessionStatus.Expired;
  return AgentVaultSessionStatus.Active;
};

// Most sessions have no label, so a session's audit event also names whose session it is and what it carried.
export const describeSessionForAudit = (session: {
  actor: TAgentVaultSessionActor;
  accessBundles: { name: string }[];
}) => ({
  sessionOwner:
    session.actor.type === AgentVaultMemberType.MachineIdentity
      ? session.actor.name
      : (session.actor.email ?? session.actor.username),
  accessBundleName: session.accessBundles[0]?.name ?? null
});
