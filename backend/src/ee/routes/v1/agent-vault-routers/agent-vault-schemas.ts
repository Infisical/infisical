import { z } from "zod";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { hostPatternSchema } from "@app/ee/services/agent-vault/agent-vault-host-pattern-fns";
import { agentVaultPathPrefixListSchema } from "@app/ee/services/agent-vault/agent-vault-path-prefix-schemas";
import {
  acceptsVariableReferences,
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
import {
  AGENT_VAULT_VARIABLE_KEY_MAX_LENGTH,
  AGENT_VAULT_VARIABLE_KEY_MESSAGE,
  AGENT_VAULT_VARIABLE_KEY_RE,
  AGENT_VAULT_VARIABLE_VALUE_MAX_LENGTH
} from "@app/ee/services/agent-vault/agent-vault-variable-fns";
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
        value: acceptsVariableReferences(
          z.string().min(1).max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        ).describe(AGENT_VAULT.SERVICE.value)
      })
      .describe(JSON.stringify({ title: "Bearer" })),
    z
      .object({
        type: z.literal(AgentVaultCredentialType.Basic),
        username: acceptsVariableReferences(
          z.string().trim().max(256).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        ).describe(AGENT_VAULT.SERVICE.username),
        password: acceptsVariableReferences(
          z.string().max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        ).describe(AGENT_VAULT.SERVICE.password)
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
        value: acceptsVariableReferences(
          z.string().min(1).max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        )
          .optional()
          .describe(AGENT_VAULT.SERVICE.updateValue)
      })
      .describe(JSON.stringify({ title: "Bearer" })),
    z
      .object({
        type: z.literal(AgentVaultCredentialType.Basic),
        username: acceptsVariableReferences(
          z.string().trim().max(256).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        )
          .optional()
          .describe(AGENT_VAULT.SERVICE.updateUsername),
        password: acceptsVariableReferences(
          z.string().max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
        )
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

const variableReferenceBase = {
  variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId),
  key: z.string().describe(AGENT_VAULT.VARIABLE.key)
};

export const AgentVaultVariableReferenceSchema = z.discriminatedUnion("field", [
  z
    .object({
      ...variableReferenceBase,
      field: z
        .enum([AgentVaultVariableReferenceField.CredentialValue, AgentVaultVariableReferenceField.CredentialUsername])
        .describe(AGENT_VAULT.SERVICE.referenceField)
    })
    .describe(JSON.stringify({ title: "Credential" })),
  z
    .object({
      ...variableReferenceBase,
      field: z.literal(AgentVaultVariableReferenceField.CustomHeader).describe(AGENT_VAULT.SERVICE.referenceField),
      customHeaderId: z.string().uuid().describe(AGENT_VAULT.SERVICE.referenceCustomHeaderId)
    })
    .describe(JSON.stringify({ title: "Custom Header" })),
  z
    .object({
      ...variableReferenceBase,
      field: z.literal(AgentVaultVariableReferenceField.Substitution).describe(AGENT_VAULT.SERVICE.referenceField),
      substitutionId: z.string().uuid().describe(AGENT_VAULT.SERVICE.referenceSubstitutionId)
    })
    .describe(JSON.stringify({ title: "Substitution" }))
]);

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
  variableReferences: AgentVaultVariableReferenceSchema.array().describe(AGENT_VAULT.SERVICE.variableReferences),
  createdAt: z.date().describe(AGENT_VAULT.SERVICE.createdAt),
  updatedAt: z.date().describe(AGENT_VAULT.SERVICE.updatedAt)
});

export const AgentVaultVariableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(AGENT_VAULT_VARIABLE_KEY_MAX_LENGTH)
  .regex(AGENT_VAULT_VARIABLE_KEY_RE, AGENT_VAULT_VARIABLE_KEY_MESSAGE);

// Braces are allowed and sent as they are. A value is never expanded again, which is also how a service can
// send a literal {{ it could not take directly.
export const AgentVaultVariableValueSchema = z
  .string()
  .min(1)
  .max(AGENT_VAULT_VARIABLE_VALUE_MAX_LENGTH)
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);

export const AgentVaultVariableSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  key: z.string().describe(AGENT_VAULT.VARIABLE.key),
  isSecret: z.boolean().describe(AGENT_VAULT.VARIABLE.isSecret),
  value: z.string().nullable().describe(AGENT_VAULT.VARIABLE.listedValue),
  serviceIds: z.string().uuid().array().describe(AGENT_VAULT.VARIABLE.serviceIds),
  createdAt: z.date().describe(AGENT_VAULT.VARIABLE.createdAt),
  updatedAt: z.date().describe(AGENT_VAULT.VARIABLE.updatedAt)
});

const memberIdsShape = (docs: { userIds: string; machineIdentityIds: string; groupIds: string }) => ({
  userIds: z.string().uuid().array().default([]).describe(docs.userIds),
  machineIdentityIds: z.string().uuid().array().default([]).describe(docs.machineIdentityIds),
  groupIds: z.string().uuid().array().default([]).describe(docs.groupIds)
});

const namedCount = (body: { userIds: string[]; machineIdentityIds: string[]; groupIds: string[]; emails?: string[] }) =>
  body.userIds.length + body.machineIdentityIds.length + body.groupIds.length + (body.emails?.length ?? 0);

export const AgentVaultProductRoleSchema = z
  .enum([ProjectMembershipRole.Admin, ProjectMembershipRole.Member])
  .describe(AGENT_VAULT.MEMBERSHIP.role);

const atLeastOne = "Name at least one user, machine identity, or group";

const atMost = (action: string) =>
  `${action} at most ${AGENT_VAULT_MAX_GRANTEES} users, machine identities, and groups at a time`;

// .refine returns a ZodEffects nothing can be extended after, so the bounds go on last and each schema
// repeats them rather than sharing a helper.
export const AgentVaultMemberIdsSchema = z
  .object(
    memberIdsShape({
      userIds: AGENT_VAULT.MEMBER.userIds,
      machineIdentityIds: AGENT_VAULT.MEMBER.machineIdentityIds,
      groupIds: AGENT_VAULT.MEMBER.groupIds
    })
  )
  .refine((body) => namedCount(body) > 0, atLeastOne)
  .refine((body) => namedCount(body) <= AGENT_VAULT_MAX_GRANTEES, atMost("Grant an access bundle to"));

export const AgentVaultProductMemberIdsSchema = z
  .object(
    memberIdsShape({
      userIds: AGENT_VAULT.MEMBERSHIP.userIds,
      machineIdentityIds: AGENT_VAULT.MEMBERSHIP.machineIdentityIds,
      groupIds: AGENT_VAULT.MEMBERSHIP.groupIds
    })
  )
  .refine((body) => namedCount(body) > 0, atLeastOne)
  .refine((body) => namedCount(body) <= AGENT_VAULT_MAX_GRANTEES, atMost("Act on"));

// One object, not an intersection: zod parses each side on its own, so the id side would strip emails
// before the refines ran, failing an emails-only body and leaving the cap blind to them.
export const AgentVaultProductMemberAddSchema = z
  .object({
    ...memberIdsShape({
      userIds: AGENT_VAULT.MEMBERSHIP.userIds,
      machineIdentityIds: AGENT_VAULT.MEMBERSHIP.machineIdentityIds,
      groupIds: AGENT_VAULT.MEMBERSHIP.groupIds
    }),
    emails: z
      .string()
      .email()
      .array()
      .default([])
      .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase")
      .describe(AGENT_VAULT.MEMBERSHIP.emails),
    role: z.enum([ProjectMembershipRole.Admin, ProjectMembershipRole.Member]).describe(AGENT_VAULT.MEMBERSHIP.role)
  })
  .refine((body) => namedCount(body) > 0, atLeastOne)
  .refine((body) => namedCount(body) <= AGENT_VAULT_MAX_GRANTEES, atMost("Act on"));

export const AgentVaultMemberRevokeIdsSchema = z
  .object(
    memberIdsShape({
      userIds: AGENT_VAULT.MEMBER.revokeUserIds,
      machineIdentityIds: AGENT_VAULT.MEMBER.revokeMachineIdentityIds,
      groupIds: AGENT_VAULT.MEMBER.revokeGroupIds
    })
  )
  .refine((body) => namedCount(body) > 0, atLeastOne)
  .refine((body) => namedCount(body) <= AGENT_VAULT_MAX_GRANTEES, atMost("Revoke an access bundle from"));

const actorTypeSchema = <T extends AgentVaultMemberType>(type: T) =>
  z.literal(type).describe(AGENT_VAULT.MEMBER.actorType);

const actorIdSchema = z.string().uuid().describe(AGENT_VAULT.MEMBER.actorId);

export const AgentVaultActorRefSchema = z.discriminatedUnion("type", [
  z
    .object({ type: actorTypeSchema(AgentVaultMemberType.User), id: actorIdSchema })
    .describe(JSON.stringify({ title: "User" })),
  z
    .object({ type: actorTypeSchema(AgentVaultMemberType.MachineIdentity), id: actorIdSchema })
    .describe(JSON.stringify({ title: "Machine identity" })),
  z
    .object({ type: actorTypeSchema(AgentVaultMemberType.Group), id: actorIdSchema })
    .describe(JSON.stringify({ title: "Group" }))
]);

const actorSchemas = <Id extends z.ZodTypeAny>(
  id: Id,
  docs: Record<"actorType" | "actorId" | "username" | "email" | "firstName" | "lastName" | "identityName", string>
) => ({
  user: z
    .object({
      type: z.literal(AgentVaultMemberType.User).describe(docs.actorType),
      id: id.describe(docs.actorId),
      username: z.string().describe(docs.username),
      email: z.string().nullable().describe(docs.email),
      firstName: z.string().nullable().describe(docs.firstName),
      lastName: z.string().nullable().describe(docs.lastName)
    })
    .describe(JSON.stringify({ title: "User" })),
  machineIdentity: z
    .object({
      type: z.literal(AgentVaultMemberType.MachineIdentity).describe(docs.actorType),
      id: id.describe(docs.actorId),
      name: z.string().describe(docs.identityName)
    })
    .describe(JSON.stringify({ title: "Machine identity" }))
});

const memberActorSchemas = actorSchemas(z.string().uuid(), AGENT_VAULT.MEMBER);

export const AgentVaultActorSchema = z.discriminatedUnion("type", [
  memberActorSchemas.user,
  memberActorSchemas.machineIdentity,
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.Group),
      id: actorIdSchema,
      name: z.string().describe(AGENT_VAULT.MEMBER.groupName)
    })
    .describe(JSON.stringify({ title: "Group" }))
]);

const sessionActorSchemas = actorSchemas(z.string().uuid().nullable(), AGENT_VAULT.SESSION);

export const AgentVaultSessionActorSchema = z.discriminatedUnion("type", [
  sessionActorSchemas.user,
  sessionActorSchemas.machineIdentity
]);

// No .default().optional(): the optional wraps the default and the default never applies.
export const agentVaultListQuery = (docs: { search: string; limit: string; offset: string }) => ({
  search: z
    .string()
    .trim()
    .max(255)
    .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
    .optional()
    .describe(docs.search),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe(docs.limit),
  offset: z.coerce.number().int().min(0).max(10000).default(0).describe(docs.offset)
});

export const AgentVaultProductActorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.User),
      id: actorIdSchema,
      username: z.string().describe(AGENT_VAULT.MEMBER.username),
      email: z.string().nullable().describe(AGENT_VAULT.MEMBER.email),
      firstName: z.string().nullable().describe(AGENT_VAULT.MEMBER.firstName),
      lastName: z.string().nullable().describe(AGENT_VAULT.MEMBER.lastName),
      isOrgMembershipPending: z.boolean().describe(AGENT_VAULT.MEMBER.isOrgMembershipPending)
    })
    .describe(JSON.stringify({ title: "User" })),
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.MachineIdentity),
      id: actorIdSchema,
      name: z.string().describe(AGENT_VAULT.MEMBER.identityName),
      isManagedByAgentVault: z.boolean().describe(AGENT_VAULT.MEMBER.isManagedByAgentVault),
      orgId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.machineIdentityOrgId)
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

export const AgentVaultProductMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  // Not the two-value input enum: the generic project membership routes reach these same rows, so one can
  // carry any role slug, and narrowing this would fail the whole list rather than render it.
  role: z.string().describe(AGENT_VAULT.MEMBERSHIP.role),
  isActive: z.boolean().describe(AGENT_VAULT.MEMBERSHIP.isActive),
  createdAt: z.date().describe(AGENT_VAULT.MEMBER.createdAt),
  actor: AgentVaultProductActorSchema
});

export const AgentVaultProductMemberRefSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  role: z.string().describe(AGENT_VAULT.MEMBERSHIP.role),
  createdAt: z.date().describe(AGENT_VAULT.MEMBER.createdAt),
  actor: AgentVaultActorRefSchema
});

export const AgentVaultSkippedActorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.User),
      id: actorIdSchema,
      identifier: z.string().describe(AGENT_VAULT.MEMBERSHIP.identifier)
    })
    .describe(JSON.stringify({ title: "User" })),
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.MachineIdentity),
      id: actorIdSchema,
      identifier: z.string().describe(AGENT_VAULT.MEMBERSHIP.identifier)
    })
    .describe(JSON.stringify({ title: "Machine identity" })),
  z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.Group),
      id: actorIdSchema,
      identifier: z.string().describe(AGENT_VAULT.MEMBERSHIP.identifier)
    })
    .describe(JSON.stringify({ title: "Group" }))
]);

export const AgentVaultRemovedMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  createdAt: z.date().describe(AGENT_VAULT.MEMBER.createdAt),
  actor: AgentVaultActorRefSchema
});

export const AgentVaultMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  createdAt: z.date().describe(AGENT_VAULT.MEMBER.createdAt),
  actor: AgentVaultActorSchema
});

export const AgentVaultCreatedMemberSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  createdAt: z.date().describe(AGENT_VAULT.MEMBER.createdAt),
  actor: AgentVaultActorRefSchema
});
