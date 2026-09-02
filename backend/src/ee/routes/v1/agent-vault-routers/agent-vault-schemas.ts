import { z } from "zod";

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

// The secret is required on write for bearer and basic, so there is no half-configured connection and
// the proxy never has a refusal path to implement.
export const AgentVaultCredentialInputSchema = z.discriminatedUnion("type", [
  AgentVaultBearerConfigSchema.partial().extend({
    type: z.literal(AgentVaultCredentialType.Bearer),
    headerName: z.string().trim().min(1).max(128).optional().describe(AGENT_VAULT.CONNECTION.headerName),
    headerPrefix: z.string().trim().max(64).optional().describe(AGENT_VAULT.CONNECTION.headerPrefix),
    value: z.string().min(1).max(8192).describe(AGENT_VAULT.CONNECTION.value)
  }),
  AgentVaultBasicConfigSchema.extend({
    type: z.literal(AgentVaultCredentialType.Basic),
    username: z.string().trim().min(1).max(256).describe(AGENT_VAULT.CONNECTION.username),
    password: z.string().min(1).max(8192).describe(AGENT_VAULT.CONNECTION.password)
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

export const AgentVaultMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  userId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.userId),
  identityId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.identityId),
  groupId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.groupId),
  name: z.string(),
  email: z.string().nullable(),
  createdAt: z.date()
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
