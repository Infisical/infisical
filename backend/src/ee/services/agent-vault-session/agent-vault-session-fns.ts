import crypto from "node:crypto";

import RE2 from "re2";
import { z } from "zod";

import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultMemberType, AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";
import {
  TAgentVaultSessionActor,
  TAgentVaultSessionMetadataFilter,
  TAgentVaultSessionOnBehalfOf
} from "./agent-vault-session-types";

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

// Left out on update keeps the label, so undefined must survive the transform rather than read as clearing it.
export const agentVaultSessionLabelUpdateSchema = agentVaultSessionLabelStringSchema
  .nullable()
  .optional()
  .transform((label) => (label === undefined ? undefined : label || null));

export const AGENT_VAULT_SESSION_METADATA_MAX_KEYS = 20;
export const AGENT_VAULT_SESSION_METADATA_KEY_MAX_LENGTH = 255;
export const AGENT_VAULT_SESSION_METADATA_VALUE_MAX_LENGTH = 1020;

const metadataKeySchema = z
  .string()
  .trim()
  .min(1, "A metadata key can't be empty")
  .max(
    AGENT_VAULT_SESSION_METADATA_KEY_MAX_LENGTH,
    `A metadata key can be at most ${AGENT_VAULT_SESSION_METADATA_KEY_MAX_LENGTH} characters`
  )
  .refine(
    isValidAgentVaultSessionLabel,
    "A metadata key can't contain line breaks, tabs, or invisible characters such as zero-width spaces or text direction marks."
  )
  // The list filter takes key=value and splits on the first =, so a key holding one could never be filtered on.
  .refine((key) => !key.includes("="), "A metadata key can't contain =");

const metadataValueSchema = (key: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter a value for metadata key '${key}'`)
    .max(
      AGENT_VAULT_SESSION_METADATA_VALUE_MAX_LENGTH,
      `The value of metadata key '${key}' can be at most ${AGENT_VAULT_SESSION_METADATA_VALUE_MAX_LENGTH} characters`
    )
    .refine(
      isValidAgentVaultSessionLabel,
      `The value of metadata key '${key}' can't contain line breaks, tabs, or invisible characters such as zero-width spaces or text direction marks.`
    );

// Keys are checked one by one rather than as a z.record key schema, which trims them and lets a later key that
// trims to the same text overwrite an earlier one without a word.
export const agentVaultSessionMetadataSchema = z
  .record(z.string(), z.string())
  .superRefine((metadata, ctx) => {
    const entries = Object.entries(metadata);
    if (entries.length > AGENT_VAULT_SESSION_METADATA_MAX_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A session can have at most ${AGENT_VAULT_SESSION_METADATA_MAX_KEYS} metadata entries`
      });
      return;
    }
    const seen = new Set<string>();
    entries.forEach(([rawKey, rawValue]) => {
      const key = metadataKeySchema.safeParse(rawKey);
      if (!key.success) {
        key.error.issues.forEach(({ message }) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [rawKey], message })
        );
        return;
      }
      if (seen.has(key.data)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [rawKey],
          message: `The metadata key '${key.data}' appears more than once. Each key can be used once per session.`
        });
        return;
      }
      seen.add(key.data);
      const value = metadataValueSchema(key.data).safeParse(rawValue);
      if (!value.success) {
        value.error.issues.forEach(({ message }) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [rawKey], message })
        );
      }
    });
  })
  .transform((metadata) =>
    Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key.trim(), value.trim()]))
  );

export type TAgentVaultSessionMetadata = Record<string, string>;

export const AGENT_VAULT_SESSION_METADATA_FILTER_FORMAT_MESSAGE =
  "Filter metadata as key=value, such as metadata=runId=8812";

// A repeated query param arrives as an array and a single one as a string. Values may contain "=", so only the
// first one separates the key.
export const agentVaultSessionMetadataFilterSchema = z
  .union([z.string(), z.string().array()])
  .transform((raw, ctx): TAgentVaultSessionMetadataFilter => {
    const pairs = typeof raw === "string" ? [raw] : raw;
    if (pairs.length > AGENT_VAULT_SESSION_METADATA_MAX_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `You can filter by at most ${AGENT_VAULT_SESSION_METADATA_MAX_KEYS} metadata entries`
      });
      return z.NEVER;
    }
    const seen = new Set<string>();
    const filter: TAgentVaultSessionMetadataFilter = [];
    pairs.forEach((pair) => {
      const separator = pair.indexOf("=");
      if (separator === -1 || !pair.slice(0, separator).trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: AGENT_VAULT_SESSION_METADATA_FILTER_FORMAT_MESSAGE });
        return;
      }
      const key = metadataKeySchema.safeParse(pair.slice(0, separator));
      if (!key.success) {
        key.error.issues.forEach(({ message }) => ctx.addIssue({ code: z.ZodIssueCode.custom, message }));
        return;
      }
      if (seen.has(key.data)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The metadata key '${key.data}' appears more than once. Filter by each key once.`
        });
        return;
      }
      seen.add(key.data);
      const value = metadataValueSchema(key.data).safeParse(pair.slice(separator + 1));
      if (!value.success) {
        value.error.issues.forEach(({ message }) => ctx.addIssue({ code: z.ZodIssueCode.custom, message }));
        return;
      }
      filter.push({ key: key.data, value: value.data });
    });
    return filter;
  });

export const isSameSessionMetadata = (a: TAgentVaultSessionMetadata, b: TAgentVaultSessionMetadata) => {
  const entries = Object.entries(a);
  return (
    entries.length === Object.keys(b).length &&
    entries.every(([key, value]) => Object.prototype.hasOwnProperty.call(b, key) && b[key] === value)
  );
};

export const hashSessionToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** sha256, not bcrypt: the token is the lookup key. It is never stored and comes back exactly once. */
export const generateSessionToken = () => {
  const token = `${AGENT_VAULT_SESSION_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashSessionToken(token) };
};

type TSessionOwnerColumns = {
  userId?: string | null;
  identityId?: string | null;
  onBehalfOfUserId?: string | null;
  onBehalfOfUserName?: string | null;
};

// The actor columns are SET NULL when the owner is deleted, so the row outlives them, and an on-behalf-of session
// keeps its user's name once that user is deleted. Resolve refuses either; the status says the same, or the list would
// show it Active when nothing can use it.
export const isOrphanedSession = (session: TSessionOwnerColumns) =>
  (!session.userId && !session.identityId) || (session.onBehalfOfUserName != null && !session.onBehalfOfUserId);

// A session started on a user's behalf belongs to the machine identity alone, so the user can't see it or its logs.
export const isSessionOwnedBy = (ctx: { actor: ActorType; actorId: string }, session: TSessionOwnerColumns) =>
  (ctx.actor === ActorType.USER && session.userId === ctx.actorId) ||
  (ctx.actor === ActorType.IDENTITY && session.identityId === ctx.actorId);

export const deriveSessionStatus = (
  session: { expiresAt: Date | null; revokedAt: Date | null } & TSessionOwnerColumns,
  now = new Date()
): AgentVaultSessionStatus => {
  if (session.revokedAt || isOrphanedSession(session)) return AgentVaultSessionStatus.Revoked;
  if (session.expiresAt && session.expiresAt <= now) return AgentVaultSessionStatus.Expired;
  return AgentVaultSessionStatus.Active;
};

// Most sessions have no label, so a session's audit event also names whose session it is and what it carried.
export const describeSessionForAudit = (session: {
  actor: TAgentVaultSessionActor;
  onBehalfOf: TAgentVaultSessionOnBehalfOf | null;
  accessBundle: { name: string } | null;
}) => ({
  sessionOwner:
    session.actor.type === AgentVaultMemberType.MachineIdentity
      ? session.actor.name
      : (session.actor.email ?? session.actor.username),
  accessBundleName: session.accessBundle?.name ?? null,
  ...(session.onBehalfOf && {
    ...(session.onBehalfOf.id && { onBehalfOfUserId: session.onBehalfOf.id }),
    onBehalfOfUserName: session.onBehalfOf.username,
    ...(session.onBehalfOf.email && { onBehalfOfUserEmail: session.onBehalfOf.email })
  })
});
