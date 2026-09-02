import { z } from "zod";

import { AgentVaultAccessBundleMembersSchema } from "@app/db/schemas";
import {
  AgentVaultBasicConfigSchema,
  AgentVaultBearerConfigSchema
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import { AgentVaultCredentialType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { hostPatternSchema } from "@app/ee/services/agent-vault/agent-vault-host-pattern";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";

export const AgentVaultNameSchema = slugSchema({ max: 64, field: "Name" });

export const AgentVaultHostPatternSchema = hostPatternSchema.describe(AGENT_VAULT.CONNECTION.hostPattern);

// The secret is sent on write for bearer and basic, so there is no half-configured connection and the
// proxy never has a refusal path to implement. Basic accepts an empty username or password, because
// RFC 7617 allows either half to be blank and services like Stripe rely on it.
export const AgentVaultCredentialInputSchema = z.discriminatedUnion("type", [
  AgentVaultBearerConfigSchema.partial().extend({
    type: z.literal(AgentVaultCredentialType.Bearer),
    headerName: z.string().trim().min(1).max(128).optional().describe(AGENT_VAULT.CONNECTION.headerName),
    headerPrefix: z.string().trim().max(64).optional().describe(AGENT_VAULT.CONNECTION.headerPrefix),
    value: z.string().min(1).max(8192).describe(AGENT_VAULT.CONNECTION.value)
  }),
  AgentVaultBasicConfigSchema.extend({
    type: z.literal(AgentVaultCredentialType.Basic),
    username: z.string().trim().max(256).describe(AGENT_VAULT.CONNECTION.username),
    password: z.string().max(8192).describe(AGENT_VAULT.CONNECTION.password)
  }),
  z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
]);

/** What every read path returns: enough to render the row, never the secret. */
export const AgentVaultCredentialSummarySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(AgentVaultCredentialType.Bearer),
    headerName: z.string().describe(AGENT_VAULT.CONNECTION.headerName),
    headerPrefix: z.string().describe(AGENT_VAULT.CONNECTION.headerPrefix)
  }),
  z.object({
    type: z.literal(AgentVaultCredentialType.Basic),
    username: z.string().describe(AGENT_VAULT.CONNECTION.username)
  }),
  z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
]);

export const AgentVaultConnectionSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.CONNECTION.connectionId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  name: z.string().describe(AGENT_VAULT.CONNECTION.name),
  hostPattern: z.string().describe(AGENT_VAULT.CONNECTION.hostPattern),
  credential: AgentVaultCredentialSummarySchema
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
