import { z } from "zod";

import { AgentVaultAccessBundleMembersSchema } from "@app/db/schemas";
import { AgentVaultCredentialType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { hostPatternSchema } from "@app/ee/services/agent-vault/agent-vault-host-pattern";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";

export const AgentVaultNameSchema = slugSchema({ max: 64, field: "Name" });

export const AgentVaultHostPatternSchema = hostPatternSchema.describe(AGENT_VAULT.CONNECTION.hostPattern);

// Both write schemas describe the same credential, but a create names it whole and an update patches
// it, so they differ in exactly one way: on update every field is optional. `AgentVaultBearerConfigSchema`
// is deliberately not reused here — its `.default()`s belong to a create, and on a PATCH they would turn
// "field omitted" into "field reset", silently moving a DD-API-KEY credential back onto Authorization.
const basicHalvesAreNotBothEmpty = (
  data: { type: AgentVaultCredentialType; username?: string; password?: string },
  ctx: z.RefinementCtx
) => {
  // Either half may be blank, but not both: `Basic ` over an empty `:` authenticates nobody, and a
  // caller who wanted no credential wants the passthrough type. The check cannot live in an
  // object-level refine, because discriminatedUnion options must be plain objects.
  if (data.type !== AgentVaultCredentialType.Basic) return;
  if (data.username === undefined || data.password === undefined) return;
  if (data.username.length > 0 || data.password.length > 0) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["username"],
    message: "A basic credential needs a username, a password, or both"
  });
};

export const AgentVaultCredentialInputSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal(AgentVaultCredentialType.Bearer),
      headerName: z.string().trim().min(1).max(128).optional().describe(AGENT_VAULT.CONNECTION.headerName),
      headerPrefix: z.string().trim().max(64).optional().describe(AGENT_VAULT.CONNECTION.headerPrefix),
      value: z.string().min(1).max(8192).describe(AGENT_VAULT.CONNECTION.value)
    }),
    z.object({
      type: z.literal(AgentVaultCredentialType.Basic),
      username: z.string().trim().max(256).describe(AGENT_VAULT.CONNECTION.username),
      password: z.string().max(8192).describe(AGENT_VAULT.CONNECTION.password)
    }),
    z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
  ])
  .superRefine(basicHalvesAreNotBothEmpty);

/**
 * Every field but the discriminator is optional, and omitting one keeps what is stored. An empty
 * string is not the same as an omission: `headerPrefix: ""` means the header carries the value alone,
 * and `password: ""` clears the password on a credential that authenticates by username.
 */
export const AgentVaultCredentialUpdateSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal(AgentVaultCredentialType.Bearer),
      headerName: z.string().trim().min(1).max(128).optional().describe(AGENT_VAULT.CONNECTION.headerName),
      headerPrefix: z.string().trim().max(64).optional().describe(AGENT_VAULT.CONNECTION.headerPrefix),
      value: z.string().min(1).max(8192).optional().describe(AGENT_VAULT.CONNECTION.updateValue)
    }),
    z.object({
      type: z.literal(AgentVaultCredentialType.Basic),
      username: z.string().trim().max(256).optional().describe(AGENT_VAULT.CONNECTION.updateUsername),
      password: z.string().max(8192).optional().describe(AGENT_VAULT.CONNECTION.updatePassword)
    }),
    z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
  ])
  .superRefine(basicHalvesAreNotBothEmpty);

/** What every read path returns: enough to render the row, never the secret. */
export const AgentVaultCredentialSummarySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(AgentVaultCredentialType.Bearer),
    headerName: z.string().describe(AGENT_VAULT.CONNECTION.headerName),
    headerPrefix: z.string().describe(AGENT_VAULT.CONNECTION.headerPrefix)
  }),
  z.object({
    type: z.literal(AgentVaultCredentialType.Basic),
    username: z.string().describe(AGENT_VAULT.CONNECTION.username),
    // Whether, never what. The sheet needs it to know if clearing the username would leave the
    // credential with no halves at all, and to say "set" or "none" instead of guessing.
    hasPassword: z.boolean().describe(AGENT_VAULT.CONNECTION.hasPassword)
  }),
  z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
]);

export const AgentVaultConnectionSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.CONNECTION.connectionId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  name: z.string().describe(AGENT_VAULT.CONNECTION.name),
  hostPattern: z.string().describe(AGENT_VAULT.CONNECTION.hostPattern),
  credential: AgentVaultCredentialSummarySchema,
  createdAt: z.date().describe(AGENT_VAULT.CONNECTION.createdAt)
});

// Raw fields, as the generic and PAM member lists return them; the frontend formats the display name.
export const AgentVaultMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  userId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.userId),
  identityId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.identityId),
  groupId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.groupId),
  createdAt: z.date(),
  user: z
    .object({
      username: z.string(),
      email: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable()
    })
    .nullable(),
  identity: z.object({ name: z.string() }).nullable(),
  group: z.object({ name: z.string() }).nullable()
});

/** What a grant returns: the inserted row, exactly as PAM and the generic member add do. */
export const AgentVaultCreatedMemberSchema = AgentVaultAccessBundleMembersSchema.pick({
  id: true,
  accessBundleId: true,
  userId: true,
  identityId: true,
  groupId: true,
  createdAt: true
});

/**
 * A cross-bundle host collision is a warning, not a rejection: blocking would let one access bundle veto
 * another, and the session's bundle order settles which credential wins.
 */
export const AgentVaultConflictWarningSchema = z.object({
  connectionName: z.string(),
  accessBundleName: z.string(),
  patterns: z.string().array()
});
