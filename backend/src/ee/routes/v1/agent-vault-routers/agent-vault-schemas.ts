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
  createdAt: z.date().describe(AGENT_VAULT.SERVICE.createdAt),
  updatedAt: z.date().describe(AGENT_VAULT.SERVICE.updatedAt)
});

// One list per actor type rather than a list of one-of-three objects: the field name carries the type,
// so nothing has to be validated after parsing, and the write stays a single atomic request.
const memberIdsShape = (docs: { userIds: string; machineIdentityIds: string; groupIds: string }) => ({
  userIds: z.string().uuid().array().default([]).describe(docs.userIds),
  machineIdentityIds: z.string().uuid().array().default([]).describe(docs.machineIdentityIds),
  groupIds: z.string().uuid().array().default([]).describe(docs.groupIds)
});

const namedCount = (body: { userIds: string[]; machineIdentityIds: string[]; groupIds: string[]; emails?: string[] }) =>
  body.userIds.length + body.machineIdentityIds.length + body.groupIds.length + (body.emails?.length ?? 0);

const atLeastOne = "Name at least one user, machine identity, or group";

const atMost = (action: string) =>
  `${action} at most ${AGENT_VAULT_MAX_GRANTEES} users, machine identities, and groups at a time`;

// The bounds go on last, and each schema repeats them, because .refine returns a ZodEffects that nothing
// can be extended after -- so a shared helper would have to give up the body's type to the spread the
// handlers do.
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
      type: actorTypeSchema(AgentVaultMemberType.MachineIdentity),
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

// The shape the session list already publishes, lifted so the paginated lists cannot drift apart. Note
// the absence of .default().optional(): the optional wraps the default and the default never applies.
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

// A product membership carries two things a bundle grant has no use for: whether the person has accepted
// their organization invite, and whether Agent Vault owns the machine identity, which decides whether it
// can be detached at all or only deleted.
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
  // Deliberately not the two-value input enum: the generic project membership routes reach these same
  // rows, so one can carry any role slug, and narrowing the response would fail the list rather than
  // render it.
  role: z.string().describe(AGENT_VAULT.MEMBERSHIP.role),
  isActive: z.boolean().describe(AGENT_VAULT.MEMBERSHIP.isActive),
  createdAt: z.date().describe(AGENT_VAULT.MEMBER.createdAt),
  actor: AgentVaultProductActorSchema
});

// The write shape: a member the call touched, with the actor named but not hydrated, because these
// endpoints do not join the actor's row and doing so per write would buy an echo of what was sent.
export const AgentVaultProductMemberRefSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.MEMBER.memberId),
  role: z.string().describe(AGENT_VAULT.MEMBERSHIP.role),
  createdAt: z.date().describe(AGENT_VAULT.MEMBER.createdAt),
  actor: AgentVaultActorRefSchema
});

// Carries the identifier the caller sent rather than only the id it resolved to, so someone who added
// ten people by email gets ten email addresses back instead of ten uuids they never saw.
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
