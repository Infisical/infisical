import { z } from "zod";

import {
  AGENT_VAULT_HEADER_NAME_MESSAGE,
  AGENT_VAULT_HEADER_NAME_RE,
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import { AgentVaultCredentialType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { hostPatternSchema } from "@app/ee/services/agent-vault/agent-vault-host-pattern";
import { AGENT_VAULT_MAX_GRANTEES } from "@app/ee/services/agent-vault-access-bundle/agent-vault-access-bundle-service";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";

export const AgentVaultNameSchema = slugSchema({ max: 64, field: "Name" });

export const AgentVaultHostPatternSchema = hostPatternSchema.describe(AGENT_VAULT.SERVICE.hostPattern);

const basicHalvesAreNotBothEmpty = (
  data: { type: AgentVaultCredentialType; username?: string; password?: string },
  ctx: z.RefinementCtx
) => {
  // Either half may be blank, but not both. The check cannot be an object-level refine, because
  // discriminatedUnion options must be plain objects.
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
      headerName: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(AGENT_VAULT_HEADER_NAME_RE, AGENT_VAULT_HEADER_NAME_MESSAGE)
        .optional()
        .describe(AGENT_VAULT.SERVICE.headerName),
      headerPrefix: z
        .string()
        .trim()
        .max(64)
        .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        .optional()
        .describe(AGENT_VAULT.SERVICE.headerPrefix),
      value: z
        .string()
        .min(1)
        .max(8192)
        .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        .describe(AGENT_VAULT.SERVICE.value)
    }),
    z.object({
      type: z.literal(AgentVaultCredentialType.Basic),
      username: z.string().trim().max(256).describe(AGENT_VAULT.SERVICE.username),
      password: z
        .string()
        .max(8192)
        .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        .describe(AGENT_VAULT.SERVICE.password)
    }),
    z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
  ])
  .superRefine(basicHalvesAreNotBothEmpty);

// Not derived from the create schema: its `.default()`s would turn an omitted field into a reset on a PATCH.
export const AgentVaultCredentialUpdateSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal(AgentVaultCredentialType.Bearer),
      headerName: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(AGENT_VAULT_HEADER_NAME_RE, AGENT_VAULT_HEADER_NAME_MESSAGE)
        .optional()
        .describe(AGENT_VAULT.SERVICE.headerName),
      headerPrefix: z
        .string()
        .trim()
        .max(64)
        .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        .optional()
        .describe(AGENT_VAULT.SERVICE.headerPrefix),
      value: z
        .string()
        .min(1)
        .max(8192)
        .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        .optional()
        .describe(AGENT_VAULT.SERVICE.updateValue)
    }),
    z.object({
      type: z.literal(AgentVaultCredentialType.Basic),
      username: z.string().trim().max(256).optional().describe(AGENT_VAULT.SERVICE.updateUsername),
      password: z
        .string()
        .max(8192)
        .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        .optional()
        .describe(AGENT_VAULT.SERVICE.updatePassword)
    }),
    z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
  ])
  .superRefine(basicHalvesAreNotBothEmpty);

export const AgentVaultCredentialSummarySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(AgentVaultCredentialType.Bearer),
    headerName: z.string().describe(AGENT_VAULT.SERVICE.headerName),
    headerPrefix: z.string().describe(AGENT_VAULT.SERVICE.headerPrefix)
  }),
  z.object({ type: z.literal(AgentVaultCredentialType.Basic) }),
  z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
]);

export const AgentVaultServiceSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  name: z.string().describe(AGENT_VAULT.SERVICE.name),
  hostPattern: z.string().describe(AGENT_VAULT.SERVICE.hostPattern),
  credential: AgentVaultCredentialSummarySchema,
  createdAt: z.date().describe(AGENT_VAULT.SERVICE.createdAt)
});

// One list per actor type rather than a list of one-of-three objects: the field name carries the type,
// so nothing has to be validated after parsing, and the grant stays a single atomic request.
export const AgentVaultMemberIdsSchema = z
  .object({
    userIds: z.string().uuid().array().default([]).describe(AGENT_VAULT.MEMBER.userIds),
    identityIds: z.string().uuid().array().default([]).describe(AGENT_VAULT.MEMBER.identityIds),
    groupIds: z.string().uuid().array().default([]).describe(AGENT_VAULT.MEMBER.groupIds)
  })
  .refine(
    (body) => body.userIds.length + body.identityIds.length + body.groupIds.length > 0,
    "Name at least one user, machine identity or group"
  )
  .refine(
    (body) => body.userIds.length + body.identityIds.length + body.groupIds.length <= AGENT_VAULT_MAX_GRANTEES,
    `Grant an access bundle to at most ${AGENT_VAULT_MAX_GRANTEES} users, machine identities and groups at a time`
  );

// A removed grant is gone, so this reports the row's own columns rather than joining the actor's name,
// the way every other membership delete on the platform does.
export const AgentVaultRemovedMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  userId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.userId),
  identityId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.identityId),
  groupId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.groupId),
  createdAt: z.date()
});

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

export const AgentVaultCreatedMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  userId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.userId),
  identityId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.identityId),
  groupId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.groupId),
  createdAt: z.date()
});
