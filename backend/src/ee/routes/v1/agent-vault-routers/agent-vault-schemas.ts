import { z } from "zod";

import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultSubstitutionSurface
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { hostPatternSchema } from "@app/ee/services/agent-vault/agent-vault-host-pattern";
import { agentVaultPathPrefixListSchema } from "@app/ee/services/agent-vault/agent-vault-path-prefix";
import {
  addDuplicateCustomHeaderNameIssues,
  addDuplicatePlaceholderIssues,
  AGENT_VAULT_MAX_CUSTOM_HEADERS,
  AGENT_VAULT_MAX_SUBSTITUTIONS,
  AgentVaultCustomHeaderInputSchema,
  AgentVaultCustomHeaderUpdateSchema,
  agentVaultHeaderNameSchema,
  AgentVaultSubstitutionInputSchema,
  AgentVaultSubstitutionUpdateSchema
} from "@app/ee/services/agent-vault/agent-vault-transformation-schemas";
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
    z
      .object({
        type: z.literal(AgentVaultCredentialType.Bearer),
        headerName: agentVaultHeaderNameSchema.optional().describe(AGENT_VAULT.SERVICE.headerName),
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
      })
      .describe(JSON.stringify({ title: "Bearer" })),
    z
      .object({
        type: z.literal(AgentVaultCredentialType.Basic),
        username: z
          .string()
          .trim()
          .max(256)
          .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          .describe(AGENT_VAULT.SERVICE.username),
        password: z
          .string()
          .max(8192)
          .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          .describe(AGENT_VAULT.SERVICE.password)
      })
      .describe(JSON.stringify({ title: "Basic Auth" })),
    z
      .object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
      .describe(JSON.stringify({ title: "Pass-through" }))
  ])
  .superRefine(basicHalvesAreNotBothEmpty);

// Not derived from the create schema: its `.default()`s would turn an omitted field into a reset on a PATCH.
export const AgentVaultCredentialUpdateSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal(AgentVaultCredentialType.Bearer),
        headerName: agentVaultHeaderNameSchema.optional().describe(AGENT_VAULT.SERVICE.headerName),
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
      })
      .describe(JSON.stringify({ title: "Bearer" })),
    z
      .object({
        type: z.literal(AgentVaultCredentialType.Basic),
        username: z
          .string()
          .trim()
          .max(256)
          .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          .optional()
          .describe(AGENT_VAULT.SERVICE.updateUsername),
        password: z
          .string()
          .max(8192)
          .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          .optional()
          .describe(AGENT_VAULT.SERVICE.updatePassword)
      })
      .describe(JSON.stringify({ title: "Basic Auth" })),
    z
      .object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
      .describe(JSON.stringify({ title: "Pass-through" }))
  ])
  .superRefine(basicHalvesAreNotBothEmpty);

export const AgentVaultCredentialSummarySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(AgentVaultCredentialType.Bearer),
      headerName: z.string().describe(AGENT_VAULT.SERVICE.headerName),
      headerPrefix: z.string().describe(AGENT_VAULT.SERVICE.headerPrefix)
    })
    .describe(JSON.stringify({ title: "Bearer" })),
  z.object({ type: z.literal(AgentVaultCredentialType.Basic) }).describe(JSON.stringify({ title: "Basic Auth" })),
  z
    .object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
    .describe(JSON.stringify({ title: "Pass-through" }))
]);

export const AgentVaultAllowedMethodsSchema = z
  .array(z.nativeEnum(AgentVaultHttpMethod))
  .min(1, "Pick at least one method, or leave this unset to allow every method.")
  .max(Object.keys(AgentVaultHttpMethod).length)
  .transform((methods) => [...new Set(methods)])
  .nullable()
  .describe(AGENT_VAULT.SERVICE.allowedMethods);

export const AgentVaultAllowedPathPrefixesSchema = agentVaultPathPrefixListSchema.describe(
  AGENT_VAULT.SERVICE.allowedPathPrefixes
);

export const AgentVaultCustomHeadersInputSchema = AgentVaultCustomHeaderInputSchema.array()
  .max(AGENT_VAULT_MAX_CUSTOM_HEADERS)
  .superRefine(addDuplicateCustomHeaderNameIssues)
  .describe(AGENT_VAULT.SERVICE.customHeaders);

export const AgentVaultCustomHeadersUpdateSchema = AgentVaultCustomHeaderUpdateSchema.array()
  .max(AGENT_VAULT_MAX_CUSTOM_HEADERS)
  .superRefine(addDuplicateCustomHeaderNameIssues)
  .describe(AGENT_VAULT.SERVICE.customHeaders);

export const AgentVaultSubstitutionsInputSchema = AgentVaultSubstitutionInputSchema.array()
  .max(AGENT_VAULT_MAX_SUBSTITUTIONS)
  .superRefine(addDuplicatePlaceholderIssues)
  .describe(AGENT_VAULT.SERVICE.substitutions);

export const AgentVaultSubstitutionsUpdateSchema = AgentVaultSubstitutionUpdateSchema.array()
  .max(AGENT_VAULT_MAX_SUBSTITUTIONS)
  .superRefine(addDuplicatePlaceholderIssues)
  .describe(AGENT_VAULT.SERVICE.substitutions);

// The sealed value is never in here. This schema is the last thing between the encrypted column and the
// wire on every service route: the serializer emits `result.data`, so anything absent here is dropped,
// and anything required here but missing from a projection is a 500 rather than a leak.
export const AgentVaultServiceSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  name: z.string().describe(AGENT_VAULT.SERVICE.name),
  hostPattern: z.string().describe(AGENT_VAULT.SERVICE.hostPattern),
  allowedMethods: z.nativeEnum(AgentVaultHttpMethod).array().nullable().describe(AGENT_VAULT.SERVICE.allowedMethods),
  allowedPathPrefixes: z.string().array().nullable().describe(AGENT_VAULT.SERVICE.allowedPathPrefixes),
  credential: AgentVaultCredentialSummarySchema,
  customHeaders: z
    .object({
      id: z.string().uuid().describe(AGENT_VAULT.SERVICE.customHeaderId),
      name: z.string().describe(AGENT_VAULT.SERVICE.customHeaderName),
      prefix: z.string().describe(AGENT_VAULT.SERVICE.customHeaderPrefix)
    })
    .array()
    .describe(AGENT_VAULT.SERVICE.customHeaders),
  substitutions: z
    .object({
      id: z.string().uuid().describe(AGENT_VAULT.SERVICE.substitutionId),
      placeholder: z.string().describe(AGENT_VAULT.SERVICE.placeholder),
      surfaces: z.nativeEnum(AgentVaultSubstitutionSurface).array().describe(AGENT_VAULT.SERVICE.surfaces)
    })
    .array()
    .describe(AGENT_VAULT.SERVICE.substitutions),
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
    "Name at least one user, machine identity, or group"
  )
  .refine(
    (body) => body.userIds.length + body.identityIds.length + body.groupIds.length <= AGENT_VAULT_MAX_GRANTEES,
    `Grant an access bundle to at most ${AGENT_VAULT_MAX_GRANTEES} users, machine identities, and groups at a time`
  );

const actorTypeSchema = <T extends AgentVaultMemberType>(type: T) =>
  z.literal(type).describe(AGENT_VAULT.MEMBER.actorType);

const actorIdSchema = z.string().uuid().describe(AGENT_VAULT.MEMBER.actorId);

// A grant names exactly one actor, so the three are a union rather than three nullable columns. Write
// responses carry only the reference: they do not join the actor's row, and adding a join to report
// what the caller just sent would cost a query per grant.
export const AgentVaultActorRefSchema = z.discriminatedUnion("type", [
  z
    .object({ type: actorTypeSchema(AgentVaultMemberType.User), id: actorIdSchema })
    .describe(JSON.stringify({ title: "User" })),
  z
    .object({ type: actorTypeSchema(AgentVaultMemberType.Identity), id: actorIdSchema })
    .describe(JSON.stringify({ title: "Machine identity" })),
  z
    .object({ type: actorTypeSchema(AgentVaultMemberType.Group), id: actorIdSchema })
    .describe(JSON.stringify({ title: "Group" }))
]);

export const AgentVaultActorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.User),
      id: actorIdSchema,
      username: z.string().describe(AGENT_VAULT.MEMBER.username),
      email: z.string().nullable().describe(AGENT_VAULT.MEMBER.email),
      firstName: z.string().nullable().describe(AGENT_VAULT.MEMBER.firstName),
      lastName: z.string().nullable().describe(AGENT_VAULT.MEMBER.lastName)
    })
    .describe(JSON.stringify({ title: "User" })),
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.Identity),
      id: actorIdSchema,
      name: z.string().describe(AGENT_VAULT.MEMBER.identityName)
    })
    .describe(JSON.stringify({ title: "Machine identity" })),
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.Group),
      id: actorIdSchema,
      name: z.string().describe(AGENT_VAULT.MEMBER.groupName)
    })
    .describe(JSON.stringify({ title: "Group" }))
]);

export const AgentVaultRemovedMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  createdAt: z.date(),
  actor: AgentVaultActorRefSchema
});

// No accessBundleId: the list route carries it in the URL and the bundle-detail route nests these
// inside the bundle, so on both it would only repeat something the caller already has.
export const AgentVaultMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  createdAt: z.date(),
  actor: AgentVaultActorSchema
});

export const AgentVaultCreatedMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  createdAt: z.date(),
  actor: AgentVaultActorRefSchema
});
