import { z } from "zod";

import { ProjectMembershipRole } from "@app/db/schemas";
import { AGENT_VAULT_MAX_GRANTEES } from "@app/ee/services/agent-vault-access-bundle/agent-vault-access-bundle-service";
import {
  AGENT_VAULT_SKILL_MAX_PATH_LENGTH,
  AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT
} from "@app/ee/services/agent-vault-skill/agent-vault-skill-fns";
import { AgentVaultSkillFileMode } from "@app/ee/services/agent-vault-skill/agent-vault-skill-types";
import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import {
  AGENT_VAULT_MEMBER_PROVIDED_FIELDS,
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultMemberType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField,
  AgentVaultVariableScope,
  TAgentVaultMemberProvidedField
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { hostPatternSchema } from "@app/ee/services/agent-vault/agent-vault-host-pattern-fns";
import { agentVaultPathPrefixListSchema } from "@app/ee/services/agent-vault/agent-vault-path-prefix-schemas";
import { agentVaultMcpServerUrlSchema } from "@app/ee/services/agent-vault/agent-vault-service-type-fns";
import {
  acceptsVariableReferences,
  addDuplicateCustomHeaderNameIssues,
  addDuplicatePlaceholderIssues,
  AGENT_VAULT_MAX_CUSTOM_HEADERS,
  AGENT_VAULT_MAX_SUBSTITUTIONS,
  AgentVaultCustomHeaderInputSchema,
  AgentVaultCustomHeaderUpdateSchema,
  agentVaultHeaderNameSchema,
  agentVaultHeaderPrefixSchema,
  AgentVaultSubstitutionInputSchema,
  AgentVaultSubstitutionUpdateSchema
} from "@app/ee/services/agent-vault/agent-vault-transformation-schemas";
import {
  AGENT_VAULT_VARIABLE_KEY_MAX_LENGTH,
  AGENT_VAULT_VARIABLE_KEY_MESSAGE,
  AGENT_VAULT_VARIABLE_KEY_RE,
  AGENT_VAULT_VARIABLE_VALUE_MAX_LENGTH
} from "@app/ee/services/agent-vault/agent-vault-variable-fns";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";

export const AgentVaultNameSchema = slugSchema({ max: 64, field: "Name" });

export const AgentVaultHostPatternSchema = hostPatternSchema.describe(AGENT_VAULT.SERVICE.hostPattern);

const bearerMemberProvidedFieldsSchema = z
  .enum([AgentVaultVariableReferenceField.CredentialValue])
  .array()
  .max(1)
  .describe(AGENT_VAULT.SERVICE.bearerMemberProvidedFields);

const basicMemberProvidedFieldsSchema = z
  .enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS)
  .array()
  .max(2)
  .describe(AGENT_VAULT.SERVICE.basicMemberProvidedFields);

type TCredentialShape = {
  type: AgentVaultCredentialType;
  value?: string;
  username?: string;
  password?: string;
  memberProvidedFields?: TAgentVaultMemberProvidedField[];
};

// The member-provided field each admin credential field stands in for.
const MEMBER_FIELD_OF_INPUT: Record<"value" | "username" | "password", TAgentVaultMemberProvidedField> = {
  value: AgentVaultVariableReferenceField.CredentialValue,
  username: AgentVaultVariableReferenceField.CredentialUsername,
  password: AgentVaultVariableReferenceField.CredentialValue
};

// Discriminated union options must be plain objects, so the checks that read two fields run on the union.
const checkCredentialFields =
  ({ requireValues, mcp }: { requireValues: boolean; mcp: boolean }) =>
  (data: TCredentialShape, ctx: z.RefinementCtx) => {
    const memberProvided = new Set(data.memberProvidedFields ?? []);

    if (mcp && memberProvided.size) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["memberProvidedFields"],
        message: "MCP services don't support member-provided credentials yet. Leave memberProvidedFields out."
      });
    }

    // A member-provided field has no admin value: each member sends their own.
    (["value", "username", "password"] as const).forEach((field) => {
      if (data[field] !== undefined && memberProvided.has(MEMBER_FIELD_OF_INPUT[field])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Leave '${field}' out: memberProvidedFields lists '${MEMBER_FIELD_OF_INPUT[field]}', so each member sets it.`
        });
      }
    });

    if (!requireValues) return;

    if (
      data.type === AgentVaultCredentialType.Bearer &&
      data.value === undefined &&
      !memberProvided.has(AgentVaultVariableReferenceField.CredentialValue)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "A bearer credential needs a token. Set one, or leave the token to each member."
      });
    }

    // Either half may be blank, but not both, unless a member sets one of them.
    if (data.type === AgentVaultCredentialType.Basic && !memberProvided.size && !data.username && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "A basic credential needs a username, a password, or both"
      });
    }
  };

// Value fields are optional in the shape so a member-provided one can be left out; the refine requires the rest.
const bearerCredentialInput = z.object({
  type: z.literal(AgentVaultCredentialType.Bearer),
  headerName: agentVaultHeaderNameSchema.optional().describe(AGENT_VAULT.SERVICE.headerName),
  headerPrefix: agentVaultHeaderPrefixSchema.optional().describe(AGENT_VAULT.SERVICE.headerPrefix),
  value: acceptsVariableReferences(
    z.string().min(1).max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
  )
    .optional()
    .describe(AGENT_VAULT.SERVICE.value),
  memberProvidedFields: bearerMemberProvidedFieldsSchema.optional()
});
const basicCredentialInput = z.object({
  type: z.literal(AgentVaultCredentialType.Basic),
  username: acceptsVariableReferences(
    z.string().trim().max(256).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
  )
    .optional()
    .describe(AGENT_VAULT.SERVICE.username),
  password: acceptsVariableReferences(
    z.string().max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
  )
    .optional()
    .describe(AGENT_VAULT.SERVICE.password),
  memberProvidedFields: basicMemberProvidedFieldsSchema.optional()
});
const passthroughCredentialInput = z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) });
const oauthCredentialInput = z.object({
  type: z.literal(AgentVaultCredentialType.OAuth),
  authorizationId: z.string().uuid().describe(AGENT_VAULT.SERVICE.authorizationId)
});

const docsTitle = (title: string, hidden = false) => JSON.stringify({ title, ...(hidden ? { "x-hidden": true } : {}) });

// Only a user in the UI can complete an authorization, so the API docs never offer OAuth. The MCP schema also
// hides the types an MCP service can't use, but still accepts them so the service refuses them by name.
const credentialInputSchema = ({ mcp }: { mcp: boolean }) =>
  z
    .discriminatedUnion("type", [
      bearerCredentialInput.describe(docsTitle("Bearer")),
      basicCredentialInput.describe(docsTitle("Basic Auth", mcp)),
      passthroughCredentialInput.describe(docsTitle("Pass-through", mcp)),
      oauthCredentialInput.describe(docsTitle("OAuth", true))
    ])
    .superRefine(checkCredentialFields({ requireValues: true, mcp }));

export const AgentVaultCredentialInputSchema = credentialInputSchema({ mcp: false });
export const AgentVaultMcpCredentialInputSchema = credentialInputSchema({ mcp: true });

// Not derived from the create schema: its `.default()`s would turn an omitted field into a reset on a PATCH.
const credentialUpdateSchema = ({ mcp }: { mcp: boolean }) =>
  z
    .discriminatedUnion("type", [
      z
        .object({
          type: z.literal(AgentVaultCredentialType.Bearer),
          headerName: agentVaultHeaderNameSchema.optional().describe(AGENT_VAULT.SERVICE.headerName),
          headerPrefix: agentVaultHeaderPrefixSchema.optional().describe(AGENT_VAULT.SERVICE.headerPrefix),
          value: acceptsVariableReferences(
            z.string().min(1).max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          )
            .optional()
            .describe(AGENT_VAULT.SERVICE.updateValue),
          memberProvidedFields: bearerMemberProvidedFieldsSchema.optional()
        })
        .describe(docsTitle("Bearer")),
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
            .describe(AGENT_VAULT.SERVICE.updatePassword),
          memberProvidedFields: basicMemberProvidedFieldsSchema.optional()
        })
        .describe(docsTitle("Basic Auth", mcp)),
      z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) }).describe(docsTitle("Pass-through", mcp)),
      z
        .object({
          type: z.literal(AgentVaultCredentialType.OAuth),
          authorizationId: z.string().uuid().describe(AGENT_VAULT.SERVICE.updateAuthorizationId)
        })
        .describe(docsTitle("OAuth", true))
    ])
    .superRefine((data, ctx) => {
      checkCredentialFields({ requireValues: false, mcp })(data, ctx);
      // A full basic update must still leave a half to send. A partial one is checked against what is stored.
      if (
        data.type === AgentVaultCredentialType.Basic &&
        data.username !== undefined &&
        data.password !== undefined &&
        !data.memberProvidedFields?.length &&
        !data.username &&
        !data.password
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["username"],
          message: "A basic credential needs a username, a password, or both"
        });
      }
    });

export const AgentVaultCredentialUpdateSchema = credentialUpdateSchema({ mcp: false });
export const AgentVaultMcpCredentialUpdateSchema = credentialUpdateSchema({ mcp: true });

export const AgentVaultCredentialSummarySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(AgentVaultCredentialType.Bearer),
      headerName: z.string().describe(AGENT_VAULT.SERVICE.headerName),
      headerPrefix: z.string().describe(AGENT_VAULT.SERVICE.headerPrefix),
      memberProvidedFields: z
        .enum([AgentVaultVariableReferenceField.CredentialValue])
        .array()
        .describe(AGENT_VAULT.SERVICE.memberProvidedFields)
    })
    .describe(JSON.stringify({ title: "Bearer" })),
  z
    .object({
      type: z.literal(AgentVaultCredentialType.Basic),
      memberProvidedFields: z
        .enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS)
        .array()
        .describe(AGENT_VAULT.SERVICE.memberProvidedFields)
    })
    .describe(JSON.stringify({ title: "Basic Auth" })),
  z
    .object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
    .describe(JSON.stringify({ title: "Pass-through" })),
  z
    .object({
      type: z.literal(AgentVaultCredentialType.OAuth),
      status: z.nativeEnum(AgentVaultOauthStatus).describe(AGENT_VAULT.SERVICE.oauthStatus),
      issuer: z.string().describe(AGENT_VAULT.SERVICE.oauthIssuer),
      grantedScopes: z.string().array().describe(AGENT_VAULT.SERVICE.oauthGrantedScopes),
      requiredScopes: z.string().array().describe(AGENT_VAULT.SERVICE.oauthRequiredScopes),
      expiresAt: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthExpiresAt),
      authorizedAt: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthAuthorizedAt),
      lastError: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthLastError)
    })
    .describe(JSON.stringify({ title: "OAuth" }))
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

export const AgentVaultServerUrlSchema = agentVaultMcpServerUrlSchema.describe(AGENT_VAULT.SERVICE.serverUrl);

const AgentVaultMcpTransportSchema = z.nativeEnum(AgentVaultMcpTransport).describe(AGENT_VAULT.SERVICE.transport);

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

// Each option also takes the other type's fields, hidden from the docs, so the service can refuse them with a
// message naming the field rather than zod dropping them silently.
export const AgentVaultCreateServiceBodySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(AgentVaultServiceType.Http).describe(AGENT_VAULT.SERVICE.type),
      name: AgentVaultNameSchema.describe(AGENT_VAULT.SERVICE.name),
      hostPattern: AgentVaultHostPatternSchema,
      allowedMethods: AgentVaultAllowedMethodsSchema.optional(),
      allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional(),
      credential: AgentVaultCredentialInputSchema,
      customHeaders: AgentVaultCustomHeadersInputSchema.optional(),
      substitutions: AgentVaultSubstitutionsInputSchema.optional(),
      serverUrl: AgentVaultServerUrlSchema.optional().describe(openApiHidden()),
      transport: AgentVaultMcpTransportSchema.optional().describe(openApiHidden())
    })
    .describe(JSON.stringify({ title: "HTTP service" })),
  z
    .object({
      type: z.literal(AgentVaultServiceType.Mcp).describe(AGENT_VAULT.SERVICE.type),
      name: AgentVaultNameSchema.describe(AGENT_VAULT.SERVICE.name),
      serverUrl: AgentVaultServerUrlSchema,
      transport: AgentVaultMcpTransportSchema,
      credential: AgentVaultMcpCredentialInputSchema.describe(AGENT_VAULT.SERVICE.mcpCredential),
      customHeaders: AgentVaultCustomHeadersInputSchema.optional(),
      hostPattern: AgentVaultHostPatternSchema.optional().describe(openApiHidden()),
      allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
      allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
      substitutions: AgentVaultSubstitutionsInputSchema.optional().describe(openApiHidden())
    })
    .describe(JSON.stringify({ title: "MCP service" }))
]);

// Every field but `type` is optional, and `type` must match the stored one. Each option also takes the fields
// GET returns for the other type (null, empty, or an MCP service's derived host pattern), so a client can send back
// what it read; anything else in them is refused by name, as on create.
export const AgentVaultUpdateServiceBodySchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal(AgentVaultServiceType.Http).describe(AGENT_VAULT.SERVICE.updateType),
        name: AgentVaultNameSchema.optional().describe(AGENT_VAULT.SERVICE.name),
        hostPattern: AgentVaultHostPatternSchema.optional(),
        allowedMethods: AgentVaultAllowedMethodsSchema.optional(),
        allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional(),
        credential: AgentVaultCredentialUpdateSchema.optional(),
        customHeaders: AgentVaultCustomHeadersUpdateSchema.optional(),
        substitutions: AgentVaultSubstitutionsUpdateSchema.optional(),
        serverUrl: AgentVaultServerUrlSchema.nullable().optional().describe(openApiHidden()),
        transport: AgentVaultMcpTransportSchema.nullable().optional().describe(openApiHidden())
      })
      .describe(JSON.stringify({ title: "HTTP service" })),
    z
      .object({
        type: z.literal(AgentVaultServiceType.Mcp).describe(AGENT_VAULT.SERVICE.updateType),
        name: AgentVaultNameSchema.optional().describe(AGENT_VAULT.SERVICE.name),
        serverUrl: AgentVaultServerUrlSchema.optional(),
        transport: AgentVaultMcpTransportSchema.optional(),
        credential: AgentVaultMcpCredentialUpdateSchema.optional().describe(AGENT_VAULT.SERVICE.mcpCredential),
        customHeaders: AgentVaultCustomHeadersUpdateSchema.optional(),
        hostPattern: AgentVaultHostPatternSchema.optional().describe(openApiHidden()),
        allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
        allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
        substitutions: AgentVaultSubstitutionsUpdateSchema.optional().describe(openApiHidden())
      })
      .describe(JSON.stringify({ title: "MCP service" }))
  ])
  .refine(
    ({ type, ...fields }) => Object.values(fields).some((value) => value !== undefined),
    "Provide at least one field besides 'type' to update"
  );

const variableReferenceBase = {
  variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId),
  key: z.string().describe(AGENT_VAULT.VARIABLE.key)
};

export const AgentVaultVariableReferenceSchema = z.discriminatedUnion("field", [
  z
    .object({
      ...variableReferenceBase,
      field: z.enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS).describe(AGENT_VAULT.SERVICE.referenceField)
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
  type: z.nativeEnum(AgentVaultServiceType).describe(AGENT_VAULT.SERVICE.type),
  serverUrl: z.string().nullable().describe(AGENT_VAULT.SERVICE.serverUrlRead),
  transport: z.nativeEnum(AgentVaultMcpTransport).nullable().describe(AGENT_VAULT.SERVICE.transportRead),
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
// send a literal {{ it could not take directly. Never trimmed, since a password can start or end with a space,
// but one that is only spaces is refused: listed or revealed, it can't be told from an empty value.
export const AgentVaultVariableValueSchema = z
  .string()
  .min(1)
  .max(AGENT_VAULT_VARIABLE_VALUE_MAX_LENGTH)
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
  .refine((value) => value.trim().length > 0, "A value can't be only spaces.");

export const AgentVaultVariableSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId),
  key: z.string().describe(AGENT_VAULT.VARIABLE.key),
  scope: z.nativeEnum(AgentVaultVariableScope).describe(AGENT_VAULT.VARIABLE.scope),
  usedByServices: z
    .object({
      id: z.string().uuid().describe(AGENT_VAULT.VARIABLE.usedByServiceId),
      name: z.string().describe(AGENT_VAULT.VARIABLE.usedByServiceName),
      hostPattern: z.string().describe(AGENT_VAULT.VARIABLE.usedByServiceHostPattern),
      accessBundleId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.usedByServiceAccessBundleId),
      accessBundleName: z.string().describe(AGENT_VAULT.VARIABLE.usedByServiceAccessBundleName)
    })
    .array()
    .describe(AGENT_VAULT.VARIABLE.usedByServices),
  createdAt: z.date().describe(AGENT_VAULT.VARIABLE.createdAt),
  updatedAt: z.date().describe(AGENT_VAULT.VARIABLE.updatedAt)
});

const personalValueFieldSchema = z.enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS).describe(AGENT_VAULT.PERSONAL_VALUE.field);

// The caller's own values for one service. Fields are listed as descriptors, so a custom header or substitution left
// to members can join them with its id and no change to this shape.
export const AgentVaultPersonalValuesSchema = z
  .object({
    isConfigured: z.boolean().describe(AGENT_VAULT.PERSONAL_VALUE.isConfigured),
    fields: z
      .object({
        field: personalValueFieldSchema,
        isSet: z.boolean().describe(AGENT_VAULT.PERSONAL_VALUE.isSet),
        updatedAt: z.date().nullable().describe(AGENT_VAULT.PERSONAL_VALUE.updatedAt),
        variableReferences: z
          .object({
            variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId),
            key: z.string().describe(AGENT_VAULT.VARIABLE.key)
          })
          .array()
          .describe(AGENT_VAULT.PERSONAL_VALUE.variableReferences)
      })
      .array()
      .describe(AGENT_VAULT.PERSONAL_VALUE.fields)
  })
  .describe(AGENT_VAULT.PERSONAL_VALUE.personalValues);

// A username follows the admin's rule for one, a token or password the admin's rule for those.
export const AgentVaultPersonalValueInputSchema = z.discriminatedUnion("field", [
  z
    .object({
      field: z.literal(AgentVaultVariableReferenceField.CredentialUsername).describe(AGENT_VAULT.PERSONAL_VALUE.field),
      value: acceptsVariableReferences(
        z.string().trim().min(1).max(256).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
      ).describe(AGENT_VAULT.PERSONAL_VALUE.value)
    })
    .describe(JSON.stringify({ title: "Username" })),
  z
    .object({
      field: z.literal(AgentVaultVariableReferenceField.CredentialValue).describe(AGENT_VAULT.PERSONAL_VALUE.field),
      value: acceptsVariableReferences(
        z.string().min(1).max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
      ).describe(AGENT_VAULT.PERSONAL_VALUE.value)
    })
    .describe(JSON.stringify({ title: "Token or Password" }))
]);

const memberIdsShape = (docs: { userIds: string; machineIdentityIds: string; groupIds: string }) => ({
  userIds: z.string().uuid().array().default([]).describe(docs.userIds),
  machineIdentityIds: z.string().uuid().array().default([]).describe(docs.machineIdentityIds),
  groupIds: z.string().uuid().array().default([]).describe(docs.groupIds)
});

const namedCount = (body: { userIds: string[]; machineIdentityIds: string[]; groupIds: string[]; emails?: string[] }) =>
  body.userIds.length + body.machineIdentityIds.length + body.groupIds.length + (body.emails?.length ?? 0);

// x-default only shapes the docs: Mintlify pre-fills its request example from a default, and a required
// enum without one is left out, so the copied example fails with a 422. Validation still requires role.
export const AgentVaultProductRoleSchema = z
  .enum([ProjectMembershipRole.Admin, ProjectMembershipRole.Member])
  .describe(JSON.stringify({ description: AGENT_VAULT.MEMBERSHIP.role, "x-default": ProjectMembershipRole.Member }));

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
    role: AgentVaultProductRoleSchema
  })
  .refine((body) => namedCount(body) > 0, atLeastOne)
  .refine((body) => namedCount(body) <= AGENT_VAULT_MAX_GRANTEES, atMost("Act on"));

export const AgentVaultProductMemberRoleUpdateSchema = z
  .object({
    ...memberIdsShape({
      userIds: AGENT_VAULT.MEMBERSHIP.userIds,
      machineIdentityIds: AGENT_VAULT.MEMBERSHIP.machineIdentityIds,
      groupIds: AGENT_VAULT.MEMBERSHIP.groupIds
    }),
    role: AgentVaultProductRoleSchema
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

const actorRefSchemas = {
  user: z
    .object({ type: actorTypeSchema(AgentVaultMemberType.User), id: actorIdSchema })
    .describe(JSON.stringify({ title: "User" })),
  machineIdentity: z
    .object({ type: actorTypeSchema(AgentVaultMemberType.MachineIdentity), id: actorIdSchema })
    .describe(JSON.stringify({ title: "Machine identity" })),
  group: z
    .object({ type: actorTypeSchema(AgentVaultMemberType.Group), id: actorIdSchema })
    .describe(JSON.stringify({ title: "Group" }))
};

export const AgentVaultActorRefSchema = z.discriminatedUnion("type", [
  actorRefSchemas.user,
  actorRefSchemas.machineIdentity,
  actorRefSchemas.group
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

const groupActorSchema = z
  .object({
    type: actorTypeSchema(AgentVaultMemberType.Group),
    id: actorIdSchema,
    name: z.string().describe(AGENT_VAULT.MEMBER.groupName)
  })
  .describe(JSON.stringify({ title: "Group" }));

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

const productActorSchemas = {
  user: z
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
  machineIdentity: z
    .object({
      type: actorTypeSchema(AgentVaultMemberType.MachineIdentity),
      id: actorIdSchema,
      name: z.string().describe(AGENT_VAULT.MEMBER.identityName),
      isManagedByAgentVault: z.boolean().describe(AGENT_VAULT.MEMBER.isManagedByAgentVault),
      orgId: z.string().uuid().nullable().describe(AGENT_VAULT.MEMBER.machineIdentityOrgId)
    })
    .describe(JSON.stringify({ title: "Machine identity" }))
};

export const AgentVaultProductActorSchema = z.discriminatedUnion("type", [
  productActorSchemas.user,
  productActorSchemas.machineIdentity,
  groupActorSchema
]);

// Not the two-value input enum: the generic project membership routes reach these same rows, so one can
// carry any role slug, and narrowing this would fail the whole list rather than render it.
const productRoleSchema = z.string().describe(AGENT_VAULT.MEMBERSHIP.role);

const addedAtSchema = z.date().describe(AGENT_VAULT.MEMBERSHIP.addedAt);

const productMemberFields = {
  role: productRoleSchema,
  isActive: z.boolean().describe(AGENT_VAULT.MEMBERSHIP.isActive),
  addedAt: addedAtSchema
};

// Members are flat and keyed by their actor, with no membership id: every write names a member by its
// actor, so the id a client reads here is the one it sends back.
export const AgentVaultProductMemberSchema = z.discriminatedUnion("type", [
  productActorSchemas.user.extend(productMemberFields),
  productActorSchemas.machineIdentity.extend(productMemberFields),
  groupActorSchema.extend(productMemberFields)
]);

const productMemberRefFields = { role: productRoleSchema, addedAt: addedAtSchema };

export const AgentVaultProductMemberRefSchema = z.discriminatedUnion("type", [
  actorRefSchemas.user.extend(productMemberRefFields),
  actorRefSchemas.machineIdentity.extend(productMemberRefFields),
  actorRefSchemas.group.extend(productMemberRefFields)
]);

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

const grantedAtSchema = z.date().describe(AGENT_VAULT.MEMBER.grantedAt);

export const AgentVaultMemberSchema = z.discriminatedUnion("type", [
  memberActorSchemas.user.extend({ grantedAt: grantedAtSchema }),
  memberActorSchemas.machineIdentity.extend({ grantedAt: grantedAtSchema }),
  groupActorSchema.extend({ grantedAt: grantedAtSchema })
]);

export const AgentVaultCreatedMemberSchema = z.discriminatedUnion("type", [
  actorRefSchemas.user.extend({ grantedAt: grantedAtSchema }),
  actorRefSchemas.machineIdentity.extend({ grantedAt: grantedAtSchema }),
  actorRefSchemas.group.extend({ grantedAt: grantedAtSchema })
]);

// Paths and limits are checked in the service, so a bad file gets a 400 that names it. These are outer bounds.
const AgentVaultSkillFileSchema = z.object({
  path: z.string().min(1).max(AGENT_VAULT_SKILL_MAX_PATH_LENGTH).describe(AGENT_VAULT.SKILL.filePath),
  mode: z.nativeEnum(AgentVaultSkillFileMode).describe(AGENT_VAULT.SKILL.fileMode),
  contentBase64: z.string().max(AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT).describe(AGENT_VAULT.SKILL.fileContent)
});

// The service refuses more than AGENT_VAULT_SKILL_MAX_FILES with a 400 that says so; a schema failure would be a 422.
const AGENT_VAULT_SKILL_UPLOAD_MAX_FILES = 1000;

export const AgentVaultSkillUploadSchema = z.object({
  files: AgentVaultSkillFileSchema.array()
    .min(1, "Upload at least SKILL.md")
    .max(AGENT_VAULT_SKILL_UPLOAD_MAX_FILES)
    .describe(AGENT_VAULT.SKILL.files)
});

export const AgentVaultSkillUpdateSchema = AgentVaultSkillUploadSchema.extend({
  baseVersion: z.number().int().positive().optional().describe(AGENT_VAULT.SKILL.baseVersion)
});

export const AgentVaultSkillVersionParamSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(2147483647)
  .describe(AGENT_VAULT.SKILL.version);

export const AgentVaultSkillSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SKILL.skillId),
  name: z.string().describe(AGENT_VAULT.SKILL.name),
  description: z.string().describe(AGENT_VAULT.SKILL.description),
  latestVersion: z.number().describe(AGENT_VAULT.SKILL.latestVersion),
  createdAt: z.date().describe(AGENT_VAULT.SKILL.createdAt),
  updatedAt: z.date().describe(AGENT_VAULT.SKILL.updatedAt)
});

export const AgentVaultSkillDetailSchema = AgentVaultSkillSchema.extend({
  accessBundles: z
    .object({
      id: z.string().uuid().describe(AGENT_VAULT.SKILL.accessBundleId),
      name: z.string().describe(AGENT_VAULT.SKILL.accessBundleName)
    })
    .array()
    .describe(AGENT_VAULT.SKILL.accessBundles)
});

export const AgentVaultSkillVersionSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SKILL.versionId),
  version: z.number().describe(AGENT_VAULT.SKILL.version),
  sha256: z.string().describe(AGENT_VAULT.SKILL.sha256),
  sizeBytes: z.number().describe(AGENT_VAULT.SKILL.sizeBytes),
  fileCount: z.number().describe(AGENT_VAULT.SKILL.fileCount),
  createdAt: z.date().describe(AGENT_VAULT.SKILL.versionCreatedAt)
});

export const AgentVaultSkillFilesResponseSchema = z
  .object({
    path: z.string().describe(AGENT_VAULT.SKILL.filePath),
    mode: z.nativeEnum(AgentVaultSkillFileMode).describe(AGENT_VAULT.SKILL.fileMode),
    contentBase64: z.string().describe(AGENT_VAULT.SKILL.fileContent)
  })
  .array()
  .describe(AGENT_VAULT.SKILL.files);

export const AgentVaultSkillVersionWithFilesSchema = AgentVaultSkillVersionSchema.extend({
  files: AgentVaultSkillFilesResponseSchema
});

export const AgentVaultBundleSkillSchema = z.object({
  id: z.string().uuid().describe(AGENT_VAULT.SKILL.skillId),
  name: z.string().describe(AGENT_VAULT.SKILL.name),
  description: z.string().describe(AGENT_VAULT.SKILL.description),
  latestVersion: z.number().describe(AGENT_VAULT.SKILL.latestVersion)
});
