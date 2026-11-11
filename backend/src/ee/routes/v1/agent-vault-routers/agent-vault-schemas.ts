import { z } from "zod";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  AGENT_VAULT_MAX_GRANTEES,
  OAUTH_NEEDS_AUTHORIZATION_OR_MEMBERS_MESSAGE
} from "@app/ee/services/agent-vault-access-bundle/agent-vault-access-bundle-service";
import {
  MAX_CLIENT_ID_LENGTH,
  MAX_CLIENT_SECRET_LENGTH,
  OAUTH_CLIENT_ID_OR_DYNAMIC_MESSAGE,
  OAUTH_CLIENT_SECRET_NEEDS_ID_MESSAGE
} from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-client-fns";
import { OAUTH_VSCHAR_PATTERN } from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-token-fns";
import { AgentVaultOauthRegistration } from "@app/ee/services/agent-vault-oauth/agent-vault-oauth-types";
import { AGENT_VAULT_MAX_SESSION_INLINE_SERVICES } from "@app/ee/services/agent-vault-session/agent-vault-session-inline-service-fns";
import {
  AGENT_VAULT_SKILL_MAX_PATH_LENGTH,
  AGENT_VAULT_SKILL_UPLOAD_BODY_LIMIT
} from "@app/ee/services/agent-vault-skill/agent-vault-skill-fns";
import { AgentVaultSkillFileMode } from "@app/ee/services/agent-vault-skill/agent-vault-skill-types";
import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE,
  AGENT_VAULT_SSH_KEY_MAX_LENGTH
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
import {
  AGENT_VAULT_MAX_NATIVE_SERVICE_NAME_LENGTH,
  AGENT_VAULT_NATIVE_MAX_CA_LENGTH,
  AGENT_VAULT_NATIVE_MAX_DATABASE_LENGTH,
  AGENT_VAULT_NATIVE_MAX_HOST_LENGTH,
  AGENT_VAULT_NATIVE_MESSAGES
} from "@app/ee/services/agent-vault/agent-vault-native-config-schemas";
import { agentVaultPathPrefixListSchema } from "@app/ee/services/agent-vault/agent-vault-path-prefix-schemas";
import { agentVaultMcpServerUrlSchema } from "@app/ee/services/agent-vault/agent-vault-service-type-fns";
import { agentVaultAllowedToolsSchema } from "@app/ee/services/agent-vault/agent-vault-tool-name-schemas";
import {
  acceptsNoVariableReferences,
  acceptsVariableReferences,
  addDuplicateCustomHeaderNameIssues,
  addDuplicatePlaceholderIssues,
  AGENT_VAULT_MAX_CUSTOM_HEADERS,
  AGENT_VAULT_MAX_SUBSTITUTIONS,
  AgentVaultCustomHeaderInputSchema,
  AgentVaultCustomHeaderUpdateSchema,
  agentVaultHeaderNameSchema,
  agentVaultHeaderPrefixSchema,
  AgentVaultInlineCustomHeaderInputSchema,
  AgentVaultInlineSubstitutionInputSchema,
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
import { containsLogUnsafeCharacters } from "@app/lib/validator/log-safe-text";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";

export const AgentVaultNameSchema = slugSchema({ max: 64, field: "Name" });

// The agent reaches a database or SSH service by name, as the DNS label `<name>.svc.agent-vault`.
const AgentVaultNativeNameSchema = slugSchema({ max: AGENT_VAULT_MAX_NATIVE_SERVICE_NAME_LENGTH, field: "Name" });

export const AgentVaultDescriptionSchema = z
  .string()
  .trim()
  .max(256, "A description can be at most 256 characters")
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
  // Blank and absent read the same, so a blank description is stored as null rather than "".
  .transform((description) => description || null);

export const AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE =
  "A description can't contain invisible characters, such as zero-width spaces or text direction marks.";

// Agents in a session read a service's description, so it also refuses characters that render as nothing: text pasted
// from elsewhere could otherwise carry instructions that an admin reviewing the service can't see.
export const AgentVaultServiceDescriptionSchema = AgentVaultDescriptionSchema.refine(
  (description) => description === null || !containsLogUnsafeCharacters(description),
  AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE
);

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
  authorizationId?: string;
  clientId?: string;
  clientSecret?: string;
  registration?: AgentVaultOauthRegistration.Dynamic;
};

// Sent to the provider as typed, unlike the credential fields that take `{{KEY}}`, so a reference would only come
// back as an invalid_client nobody can explain.
const printableOauthText = (max: number) =>
  z
    .string()
    .max(max)
    .regex(OAUTH_VSCHAR_PATTERN, "Use printable ASCII characters without line breaks or accents")
    .refine((value) => !value.includes("{{"), "Variables aren't supported here. Paste the value.");

export const AgentVaultOauthClientIdSchema = z.string().trim().min(1).pipe(printableOauthText(MAX_CLIENT_ID_LENGTH));
export const AgentVaultOauthClientSecretSchema = z.string().min(1).pipe(printableOauthText(MAX_CLIENT_SECRET_LENGTH));

// An OAuth credential is either the admin's own sign-in (an authorization) or left to each member, who signs in for
// themselves; the client every member signs in with is set only in the second case.
const checkOauthCredentialFields = (requireValues: boolean, data: TCredentialShape, ctx: z.RefinementCtx) => {
  const memberProvided = Boolean(data.memberProvidedFields?.length);
  const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (data.clientId && data.registration) {
    issue("registration", OAUTH_CLIENT_ID_OR_DYNAMIC_MESSAGE);
  }
  if (memberProvided) {
    if (data.authorizationId) {
      issue("authorizationId", "Leave 'authorizationId' out: each member signs in with their own account.");
    }
    if (requireValues && data.clientSecret && !data.clientId) {
      issue("clientSecret", OAUTH_CLIENT_SECRET_NEEDS_ID_MESSAGE);
    }
    return;
  }
  // An update that names memberProvidedFields as an empty list, or sends an authorization, hands the sign-in back to
  // the admin; one that leaves both out may still only change the members' client.
  const handsBack = requireValues || data.memberProvidedFields !== undefined || Boolean(data.authorizationId);
  if (handsBack) {
    (["clientId", "clientSecret", "registration"] as const).forEach((field) => {
      if (data[field] !== undefined) {
        issue(
          field,
          `Leave '${field}' out unless the sign-in is left to each member. To use your own OAuth app, enter it when you authorize.`
        );
      }
    });
    if (!data.authorizationId) {
      issue("authorizationId", OAUTH_NEEDS_AUTHORIZATION_OR_MEMBERS_MESSAGE);
    }
  }
};

// The member-provided field each admin credential field stands in for.
const MEMBER_FIELD_OF_INPUT: Record<"value" | "username" | "password", TAgentVaultMemberProvidedField> = {
  value: AgentVaultVariableReferenceField.CredentialValue,
  username: AgentVaultVariableReferenceField.CredentialUsername,
  password: AgentVaultVariableReferenceField.CredentialValue
};

// Discriminated union options must be plain objects, so the checks that read two fields run on the union.
const checkCredentialFields =
  ({ requireValues }: { requireValues: boolean }) =>
  (data: TCredentialShape, ctx: z.RefinementCtx) => {
    const memberProvided = new Set(data.memberProvidedFields ?? []);

    if (data.type === AgentVaultCredentialType.OAuth) {
      checkOauthCredentialFields(requireValues, data, ctx);
      return;
    }

    // A member-provided field has no admin value: each member sends their own. An SSH key can't be member-provided
    // at all, which the service says by name, so telling the caller to leave the username out would only mislead.
    if (data.type === AgentVaultCredentialType.SshKey) return;
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
const nativeBasicCredentialInput = basicCredentialInput.extend({
  username: basicCredentialInput.shape.username.describe(AGENT_VAULT.SERVICE.nativeUsername),
  password: basicCredentialInput.shape.password.describe(AGENT_VAULT.SERVICE.nativePassword)
});
const passthroughCredentialInput = z.object({ type: z.literal(AgentVaultCredentialType.Passthrough) });

// A key spans lines, so only tabs and line breaks are allowed among the control characters.
// eslint-disable-next-line no-control-regex
const SSH_KEY_TEXT_RE = /^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]*$/;
const SSH_KEY_TEXT_MESSAGE =
  "This can't contain control characters other than line breaks. Paste the key file's contents as they are.";

const sshUsernameSchema = z
  .string()
  .trim()
  .min(1, "Enter the user to log in as.")
  .max(256)
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);
const sshPrivateKeySchema = z
  .string()
  .trim()
  .min(1, "Paste the private key.")
  .max(AGENT_VAULT_SSH_KEY_MAX_LENGTH)
  .regex(SSH_KEY_TEXT_RE, SSH_KEY_TEXT_MESSAGE);
const sshCertificateSchema = z
  .string()
  .trim()
  .max(AGENT_VAULT_SSH_KEY_MAX_LENGTH)
  .regex(SSH_KEY_TEXT_RE, SSH_KEY_TEXT_MESSAGE);

// Takes memberProvidedFields, hidden, so the service refuses it by name: a key can't be left to members yet.
const sshKeyCredentialInput = z.object({
  type: z.literal(AgentVaultCredentialType.SshKey),
  username: sshUsernameSchema.describe(AGENT_VAULT.SERVICE.sshUsername),
  privateKey: sshPrivateKeySchema.describe(AGENT_VAULT.SERVICE.sshPrivateKey),
  certificate: sshCertificateSchema.optional().describe(AGENT_VAULT.SERVICE.sshCertificate),
  memberProvidedFields: z.enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS).array().max(2).optional().describe(openApiHidden())
});
const oauthCredentialFields = {
  type: z.literal(AgentVaultCredentialType.OAuth),
  memberProvidedFields: bearerMemberProvidedFieldsSchema
    .optional()
    .describe(AGENT_VAULT.SERVICE.oauthMemberProvidedFields),
  clientId: AgentVaultOauthClientIdSchema.optional().describe(AGENT_VAULT.SERVICE.oauthClientId),
  clientSecret: AgentVaultOauthClientSecretSchema.optional().describe(AGENT_VAULT.SERVICE.oauthClientSecret),
  registration: z
    .literal(AgentVaultOauthRegistration.Dynamic)
    .optional()
    .describe(AGENT_VAULT.SERVICE.oauthRegistration)
};
const oauthCredentialInput = z.object({
  ...oauthCredentialFields,
  authorizationId: z.string().uuid().optional().describe(AGENT_VAULT.SERVICE.authorizationId)
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
      oauthCredentialInput.describe(docsTitle("OAuth", true)),
      sshKeyCredentialInput.describe(docsTitle("SSH Key", true))
    ])
    .superRefine(checkCredentialFields({ requireValues: true }));

export const AgentVaultCredentialInputSchema = credentialInputSchema({ mcp: false });
export const AgentVaultMcpCredentialInputSchema = credentialInputSchema({ mcp: true });

// Every type is accepted, the ones a database or SSH service can't use hidden, so the service refuses them by name.
const nativeCredentialInputSchema = ({ ssh }: { ssh: boolean }) =>
  z
    .discriminatedUnion("type", [
      nativeBasicCredentialInput.describe(docsTitle("Username and Password")),
      sshKeyCredentialInput.describe(docsTitle("SSH Key", !ssh)),
      bearerCredentialInput.describe(docsTitle("Bearer", true)),
      passthroughCredentialInput.describe(docsTitle("Pass-through", true)),
      oauthCredentialInput.describe(docsTitle("OAuth", true))
    ])
    .superRefine(checkCredentialFields({ requireValues: true }))
    .describe(ssh ? AGENT_VAULT.SERVICE.sshCredential : AGENT_VAULT.SERVICE.databaseCredential);

// Not derived from the create schema: its `.default()`s would turn an omitted field into a reset on a PATCH.
const credentialUpdateSchema = ({
  mcp,
  native = false,
  ssh = false
}: {
  mcp: boolean;
  native?: boolean;
  ssh?: boolean;
}) =>
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
        .describe(docsTitle("Bearer", native)),
      z
        .object({
          type: z.literal(AgentVaultCredentialType.Basic),
          username: acceptsVariableReferences(
            z.string().trim().max(256).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          )
            .optional()
            .describe(native ? AGENT_VAULT.SERVICE.updateNativeUsername : AGENT_VAULT.SERVICE.updateUsername),
          password: acceptsVariableReferences(
            z.string().max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          )
            .optional()
            .describe(native ? AGENT_VAULT.SERVICE.updateNativePassword : AGENT_VAULT.SERVICE.updatePassword),
          memberProvidedFields: basicMemberProvidedFieldsSchema.optional()
        })
        .describe(docsTitle(native ? "Username and Password" : "Basic Auth", mcp)),
      z
        .object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
        .describe(docsTitle("Pass-through", mcp || native)),
      z
        .object({
          ...oauthCredentialFields,
          authorizationId: z.string().uuid().optional().describe(AGENT_VAULT.SERVICE.updateAuthorizationId)
        })
        .describe(docsTitle("OAuth", true)),
      z
        .object({
          type: z.literal(AgentVaultCredentialType.SshKey),
          username: sshUsernameSchema.optional().describe(AGENT_VAULT.SERVICE.sshUsername),
          privateKey: sshPrivateKeySchema.optional().describe(AGENT_VAULT.SERVICE.updateSshPrivateKey),
          // An emptied field is not a removal: only null removes the stored certificate.
          certificate: sshCertificateSchema
            .transform((value) => value || undefined)
            .nullable()
            .optional()
            .describe(AGENT_VAULT.SERVICE.updateSshCertificate),
          memberProvidedFields: z
            .enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS)
            .array()
            .max(2)
            .optional()
            .describe(openApiHidden())
        })
        .describe(docsTitle("SSH Key", !ssh))
    ])
    .superRefine((data, ctx) => {
      checkCredentialFields({ requireValues: false })(data, ctx);
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
const nativeCredentialUpdateSchema = ({ ssh }: { ssh: boolean }) =>
  credentialUpdateSchema({ mcp: false, native: true, ssh }).describe(
    ssh ? AGENT_VAULT.SERVICE.sshCredential : AGENT_VAULT.SERVICE.databaseCredential
  );

const bearerCredentialSummarySchema = z
  .object({
    type: z.literal(AgentVaultCredentialType.Bearer),
    headerName: z.string().describe(AGENT_VAULT.SERVICE.headerName),
    headerPrefix: z.string().describe(AGENT_VAULT.SERVICE.headerPrefix),
    memberProvidedFields: z
      .enum([AgentVaultVariableReferenceField.CredentialValue])
      .array()
      .describe(AGENT_VAULT.SERVICE.bearerMemberProvidedFieldsRead)
  })
  .describe(JSON.stringify({ title: "Bearer" }));

// Titled as each type's request names the credential.
const basicCredentialSummarySchema = (title: "Basic Auth" | "Username and Password") =>
  z
    .object({
      type: z.literal(AgentVaultCredentialType.Basic),
      memberProvidedFields: z
        .enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS)
        .array()
        .describe(AGENT_VAULT.SERVICE.basicMemberProvidedFieldsRead)
    })
    .describe(JSON.stringify({ title }));

const passthroughCredentialSummarySchema = z
  .object({ type: z.literal(AgentVaultCredentialType.Passthrough) })
  .describe(JSON.stringify({ title: "Pass-through" }));

const sshKeyCredentialSummarySchema = z
  .object({
    type: z.literal(AgentVaultCredentialType.SshKey),
    hasCertificate: z.boolean().describe(AGENT_VAULT.SERVICE.sshHasCertificate)
  })
  .describe(JSON.stringify({ title: "SSH Key" }));

const oauthCredentialSummarySchema = z
  .object({
    type: z.literal(AgentVaultCredentialType.OAuth),
    memberProvidedFields: z
      .enum([AgentVaultVariableReferenceField.CredentialValue])
      .array()
      .describe(AGENT_VAULT.SERVICE.oauthMemberProvidedFieldsRead),
    status: z.nativeEnum(AgentVaultOauthStatus).optional().describe(AGENT_VAULT.SERVICE.oauthSummaryStatus),
    issuer: z.string().describe(AGENT_VAULT.SERVICE.oauthIssuer),
    registration: z
      .nativeEnum(AgentVaultOauthRegistration)
      .optional()
      .describe(AGENT_VAULT.SERVICE.oauthRegistrationMode),
    clientId: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthSummaryClientId),
    grantedScopes: z.string().array().describe(AGENT_VAULT.SERVICE.oauthGrantedScopes),
    requiredScopes: z.string().array().describe(AGENT_VAULT.SERVICE.oauthRequiredScopes),
    expiresAt: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthExpiresAt),
    authorizedAt: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthAuthorizedAt),
    lastError: z.string().nullable().optional().describe(AGENT_VAULT.SERVICE.oauthLastError)
  })
  .describe(JSON.stringify({ title: "OAuth" }));

// The credentials each type accepts on create and update (allowedCredentialTypes), so every stored row parses.
const credentialSummarySchemas = {
  [AgentVaultServiceType.Http]: z.discriminatedUnion("type", [
    bearerCredentialSummarySchema,
    basicCredentialSummarySchema("Basic Auth"),
    passthroughCredentialSummarySchema
  ]),
  [AgentVaultServiceType.Mcp]: z.discriminatedUnion("type", [
    bearerCredentialSummarySchema,
    oauthCredentialSummarySchema
  ]),
  [AgentVaultServiceType.Postgres]: basicCredentialSummarySchema("Username and Password"),
  [AgentVaultServiceType.Mysql]: basicCredentialSummarySchema("Username and Password"),
  [AgentVaultServiceType.Ssh]: z.discriminatedUnion("type", [
    basicCredentialSummarySchema("Username and Password"),
    sshKeyCredentialSummarySchema
  ])
};

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

export const AgentVaultAllowedToolsSchema = agentVaultAllowedToolsSchema.describe(AGENT_VAULT.SERVICE.allowedTools);

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

// Checked fully when the service builds its config; bounded here so nothing unreasonable reaches it.
const AgentVaultNativeHostSchema = z
  .string()
  .trim()
  .min(1, AGENT_VAULT_NATIVE_MESSAGES.hostRequired)
  .max(AGENT_VAULT_NATIVE_MAX_HOST_LENGTH, AGENT_VAULT_NATIVE_MESSAGES.hostTooLong);
const AgentVaultNativePortSchema = z
  .number()
  .int(AGENT_VAULT_NATIVE_MESSAGES.portWhole)
  .min(1, AGENT_VAULT_NATIVE_MESSAGES.portRange)
  .max(65535, AGENT_VAULT_NATIVE_MESSAGES.portRange);
const nativeDatabaseSchema = (params?: z.RawCreateParams) =>
  z
    .string(params)
    .trim()
    .min(1, AGENT_VAULT_NATIVE_MESSAGES.databaseRequired)
    .max(AGENT_VAULT_NATIVE_MAX_DATABASE_LENGTH, AGENT_VAULT_NATIVE_MESSAGES.databaseTooLong);
const AgentVaultNativeDatabaseSchema = nativeDatabaseSchema();
// Create takes null for `ca` too, which only an update gives a meaning, so only the update's docs mention it.
const nativeTlsSchema = ({ update = false, params }: { update?: boolean; params?: z.RawCreateParams } = {}) =>
  z.object(
    {
      enabled: z.boolean().optional().describe(AGENT_VAULT.SERVICE.tlsEnabled),
      verify: z.boolean().optional().describe(AGENT_VAULT.SERVICE.tlsVerify),
      ca: z
        .string()
        .max(AGENT_VAULT_NATIVE_MAX_CA_LENGTH, AGENT_VAULT_NATIVE_MESSAGES.caTooLong)
        .nullable()
        .optional()
        .describe(update ? AGENT_VAULT.SERVICE.updateTlsCa : AGENT_VAULT.SERVICE.tlsCa)
    },
    params
  );
const AgentVaultNativeTlsSchema = nativeTlsSchema();

type TNativeServiceType = AgentVaultServiceType.Postgres | AgentVaultServiceType.Mysql | AgentVaultServiceType.Ssh;

const nativePortDocs = {
  [AgentVaultServiceType.Postgres]: AGENT_VAULT.SERVICE.postgresPort,
  [AgentVaultServiceType.Mysql]: AGENT_VAULT.SERVICE.mysqlPort,
  [AgentVaultServiceType.Ssh]: AGENT_VAULT.SERVICE.sshPort
} as const;

const nativeDatabaseDocs = (type: TNativeServiceType) =>
  type === AgentVaultServiceType.Mysql ? AGENT_VAULT.SERVICE.mysqlDatabase : AGENT_VAULT.SERVICE.postgresDatabase;

const nativeCreateFields = (type: TNativeServiceType) => ({
  host: AgentVaultNativeHostSchema.describe(AGENT_VAULT.SERVICE.host),
  port: AgentVaultNativePortSchema.optional().describe(nativePortDocs[type])
});

const nativeDatabaseCreateFields = (type: TNativeServiceType) => ({
  database: AgentVaultNativeDatabaseSchema.describe(nativeDatabaseDocs(type)),
  tls: AgentVaultNativeTlsSchema.optional().describe(AGENT_VAULT.SERVICE.tls)
});

// What an HTTP or MCP service doesn't take, accepted hidden so the service refuses it by name.
const hiddenNativeCreateFields = {
  host: AgentVaultNativeHostSchema.optional().describe(openApiHidden()),
  port: AgentVaultNativePortSchema.optional().describe(openApiHidden()),
  database: AgentVaultNativeDatabaseSchema.optional().describe(openApiHidden()),
  tls: AgentVaultNativeTlsSchema.optional().describe(openApiHidden())
};

// GET returns these as null for an HTTP or MCP service, so an update takes the null back.
const hiddenNativeUpdateFields = {
  host: AgentVaultNativeHostSchema.nullable().optional().describe(openApiHidden()),
  port: AgentVaultNativePortSchema.nullable().optional().describe(openApiHidden()),
  database: AgentVaultNativeDatabaseSchema.nullable().optional().describe(openApiHidden()),
  tls: AgentVaultNativeTlsSchema.nullable().optional().describe(openApiHidden())
};

const hiddenHttpMcpCreateFields = {
  hostPattern: AgentVaultHostPatternSchema.optional().describe(openApiHidden()),
  serverUrl: AgentVaultServerUrlSchema.optional().describe(openApiHidden()),
  transport: AgentVaultMcpTransportSchema.optional().describe(openApiHidden()),
  allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
  allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
  allowedTools: AgentVaultAllowedToolsSchema.optional().describe(openApiHidden()),
  customHeaders: AgentVaultCustomHeadersInputSchema.optional().describe(openApiHidden()),
  substitutions: AgentVaultSubstitutionsInputSchema.optional().describe(openApiHidden())
};

// GET returns these as null or empty for a database or SSH service.
const hiddenHttpMcpUpdateFields = {
  hostPattern: AgentVaultHostPatternSchema.nullable().optional().describe(openApiHidden()),
  serverUrl: AgentVaultServerUrlSchema.nullable().optional().describe(openApiHidden()),
  transport: AgentVaultMcpTransportSchema.nullable().optional().describe(openApiHidden()),
  allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
  allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
  allowedTools: AgentVaultAllowedToolsSchema.optional().describe(openApiHidden()),
  customHeaders: AgentVaultCustomHeadersUpdateSchema.optional().describe(openApiHidden()),
  substitutions: AgentVaultSubstitutionsUpdateSchema.optional().describe(openApiHidden())
};

const nativeServiceTitles = {
  [AgentVaultServiceType.Postgres]: "PostgreSQL",
  [AgentVaultServiceType.Mysql]: "MySQL",
  [AgentVaultServiceType.Ssh]: "SSH"
} as const;

const nativeCreateArm = <T extends TNativeServiceType>(type: T) =>
  z
    .object({
      ...hiddenHttpMcpCreateFields,
      ...(type === AgentVaultServiceType.Ssh
        ? { database: hiddenNativeCreateFields.database, tls: hiddenNativeCreateFields.tls }
        : nativeDatabaseCreateFields(type)),
      type: z.literal(type).describe(AGENT_VAULT.SERVICE.type),
      name: AgentVaultNativeNameSchema.describe(AGENT_VAULT.SERVICE.nativeName),
      description: AgentVaultServiceDescriptionSchema.optional().describe(AGENT_VAULT.SERVICE.description),
      ...nativeCreateFields(type),
      credential: nativeCredentialInputSchema({ ssh: type === AgentVaultServiceType.Ssh })
    })
    .describe(JSON.stringify({ title: nativeServiceTitles[type] }));

const nativeUpdateArm = <T extends TNativeServiceType>(type: T) =>
  z
    .object({
      ...hiddenHttpMcpUpdateFields,
      type: z.literal(type).describe(AGENT_VAULT.SERVICE.updateType),
      name: AgentVaultNativeNameSchema.optional().describe(AGENT_VAULT.SERVICE.nativeName),
      description: AgentVaultServiceDescriptionSchema.nullable()
        .optional()
        .describe(AGENT_VAULT.SERVICE.updateDescription),
      host: AgentVaultNativeHostSchema.optional().describe(AGENT_VAULT.SERVICE.host),
      port: AgentVaultNativePortSchema.optional().describe(nativePortDocs[type]),
      // Null is only the read-back of an SSH service, which has neither. A database always has both, so null there
      // would silently change nothing.
      ...(type === AgentVaultServiceType.Ssh
        ? { database: hiddenNativeUpdateFields.database, tls: hiddenNativeUpdateFields.tls }
        : {
            database: nativeDatabaseSchema({
              invalid_type_error: `A ${nativeServiceTitles[type]} service always has a database. Send its name, or leave 'database' out to keep it.`
            })
              .optional()
              .describe(nativeDatabaseDocs(type)),
            tls: nativeTlsSchema({
              update: true,
              params: {
                invalid_type_error:
                  "Send the TLS settings to change, or leave 'tls' out to keep them. To turn TLS off, send 'tls': { 'enabled': false }."
              }
            })
              .optional()
              .describe(AGENT_VAULT.SERVICE.updateTls)
          }),
      credential: nativeCredentialUpdateSchema({ ssh: type === AgentVaultServiceType.Ssh }).optional()
    })
    .describe(JSON.stringify({ title: nativeServiceTitles[type] }));

// Each option also takes the other type's fields, hidden from the docs, so the service can refuse them with a
// message naming the field rather than zod dropping them silently.
export const AgentVaultCreateServiceBodySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(AgentVaultServiceType.Http).describe(AGENT_VAULT.SERVICE.type),
      name: AgentVaultNameSchema.describe(AGENT_VAULT.SERVICE.name),
      description: AgentVaultServiceDescriptionSchema.optional().describe(AGENT_VAULT.SERVICE.description),
      hostPattern: AgentVaultHostPatternSchema,
      allowedMethods: AgentVaultAllowedMethodsSchema.optional(),
      allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional(),
      credential: AgentVaultCredentialInputSchema,
      customHeaders: AgentVaultCustomHeadersInputSchema.optional(),
      substitutions: AgentVaultSubstitutionsInputSchema.optional(),
      serverUrl: AgentVaultServerUrlSchema.optional().describe(openApiHidden()),
      transport: AgentVaultMcpTransportSchema.optional().describe(openApiHidden()),
      allowedTools: AgentVaultAllowedToolsSchema.optional().describe(openApiHidden()),
      ...hiddenNativeCreateFields
    })
    .describe(JSON.stringify({ title: "HTTP" })),
  z
    .object({
      type: z.literal(AgentVaultServiceType.Mcp).describe(AGENT_VAULT.SERVICE.type),
      name: AgentVaultNameSchema.describe(AGENT_VAULT.SERVICE.name),
      description: AgentVaultServiceDescriptionSchema.optional().describe(AGENT_VAULT.SERVICE.description),
      serverUrl: AgentVaultServerUrlSchema,
      transport: AgentVaultMcpTransportSchema,
      credential: AgentVaultMcpCredentialInputSchema.describe(AGENT_VAULT.SERVICE.mcpCredential),
      allowedTools: AgentVaultAllowedToolsSchema.optional(),
      customHeaders: AgentVaultCustomHeadersInputSchema.optional(),
      hostPattern: AgentVaultHostPatternSchema.optional().describe(openApiHidden()),
      allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
      allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
      substitutions: AgentVaultSubstitutionsInputSchema.optional().describe(openApiHidden()),
      ...hiddenNativeCreateFields
    })
    .describe(JSON.stringify({ title: "MCP" })),
  nativeCreateArm(AgentVaultServiceType.Postgres),
  nativeCreateArm(AgentVaultServiceType.Mysql),
  nativeCreateArm(AgentVaultServiceType.Ssh)
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
        description: AgentVaultServiceDescriptionSchema.nullable()
          .optional()
          .describe(AGENT_VAULT.SERVICE.updateDescription),
        hostPattern: AgentVaultHostPatternSchema.optional(),
        allowedMethods: AgentVaultAllowedMethodsSchema.optional(),
        allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional(),
        credential: AgentVaultCredentialUpdateSchema.optional(),
        customHeaders: AgentVaultCustomHeadersUpdateSchema.optional(),
        substitutions: AgentVaultSubstitutionsUpdateSchema.optional(),
        serverUrl: AgentVaultServerUrlSchema.nullable().optional().describe(openApiHidden()),
        transport: AgentVaultMcpTransportSchema.nullable().optional().describe(openApiHidden()),
        allowedTools: AgentVaultAllowedToolsSchema.optional().describe(openApiHidden()),
        ...hiddenNativeUpdateFields
      })
      .describe(JSON.stringify({ title: "HTTP" })),
    z
      .object({
        type: z.literal(AgentVaultServiceType.Mcp).describe(AGENT_VAULT.SERVICE.updateType),
        name: AgentVaultNameSchema.optional().describe(AGENT_VAULT.SERVICE.name),
        description: AgentVaultServiceDescriptionSchema.nullable()
          .optional()
          .describe(AGENT_VAULT.SERVICE.updateDescription),
        serverUrl: AgentVaultServerUrlSchema.optional(),
        transport: AgentVaultMcpTransportSchema.optional(),
        credential: AgentVaultMcpCredentialUpdateSchema.optional().describe(AGENT_VAULT.SERVICE.mcpCredential),
        allowedTools: AgentVaultAllowedToolsSchema.optional(),
        customHeaders: AgentVaultCustomHeadersUpdateSchema.optional(),
        hostPattern: AgentVaultHostPatternSchema.optional().describe(openApiHidden()),
        allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
        allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
        substitutions: AgentVaultSubstitutionsUpdateSchema.optional().describe(openApiHidden()),
        ...hiddenNativeUpdateFields
      })
      .describe(JSON.stringify({ title: "MCP" })),
    nativeUpdateArm(AgentVaultServiceType.Postgres),
    nativeUpdateArm(AgentVaultServiceType.Mysql),
    nativeUpdateArm(AgentVaultServiceType.Ssh)
  ])
  .refine(
    ({ type, ...fields }) => Object.values(fields).some((value) => value !== undefined),
    "Provide at least one field besides 'type' to update"
  );

// A service sent with a session takes no member-provided field and no OAuth: whoever starts the session sends every
// value, and an OAuth service is connected by signing in from the UI. Both are still accepted, hidden, so the session
// service refuses them by name rather than zod dropping a field silently.
const inlineMemberProvidedFieldsSchema = z.string().max(64).array().max(2).optional().describe(openApiHidden());

const inlineCredentialInputSchema = ({
  mcp,
  native = false,
  ssh = false
}: {
  mcp: boolean;
  native?: boolean;
  ssh?: boolean;
}) =>
  z
    .discriminatedUnion("type", [
      z
        .object({
          type: z.literal(AgentVaultCredentialType.Bearer),
          headerName: agentVaultHeaderNameSchema.optional().describe(AGENT_VAULT.SERVICE.headerName),
          headerPrefix: agentVaultHeaderPrefixSchema.optional().describe(AGENT_VAULT.SERVICE.headerPrefix),
          value: acceptsNoVariableReferences(
            z.string().min(1).max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          ).describe(AGENT_VAULT.SESSION.inlineServiceValue),
          memberProvidedFields: inlineMemberProvidedFieldsSchema
        })
        .describe(docsTitle("Bearer", native)),
      z
        .object({
          type: z.literal(AgentVaultCredentialType.Basic),
          username: acceptsNoVariableReferences(
            z.string().trim().max(256).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          )
            .optional()
            .describe(native ? AGENT_VAULT.SESSION.inlineNativeUsername : AGENT_VAULT.SESSION.inlineServiceUsername),
          password: acceptsNoVariableReferences(
            z.string().max(8192).regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
          )
            .optional()
            .describe(native ? AGENT_VAULT.SESSION.inlineNativePassword : AGENT_VAULT.SESSION.inlineServicePassword),
          memberProvidedFields: inlineMemberProvidedFieldsSchema
        })
        .describe(docsTitle(native ? "Username and Password" : "Basic Auth", mcp)),
      passthroughCredentialInput.describe(docsTitle("Pass-through", mcp || native)),
      z
        .object({
          type: z.literal(AgentVaultCredentialType.OAuth),
          authorizationId: z.string().uuid().optional()
        })
        .describe(docsTitle("OAuth", true)),
      z
        .object({
          type: z.literal(AgentVaultCredentialType.SshKey),
          username: acceptsNoVariableReferences(sshUsernameSchema).describe(AGENT_VAULT.SERVICE.sshUsername),
          privateKey: acceptsNoVariableReferences(sshPrivateKeySchema).describe(AGENT_VAULT.SERVICE.sshPrivateKey),
          certificate: acceptsNoVariableReferences(sshCertificateSchema)
            .optional()
            .describe(AGENT_VAULT.SERVICE.sshCertificate),
          memberProvidedFields: inlineMemberProvidedFieldsSchema
        })
        .describe(docsTitle("SSH Key", !ssh))
    ])
    .superRefine((data, ctx) => {
      if (data.type === AgentVaultCredentialType.Basic && !data.username && !data.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["username"],
          message: "A basic credential needs a username, a password, or both"
        });
      }
    });

const AgentVaultInlineCustomHeadersInputSchema = AgentVaultInlineCustomHeaderInputSchema.array()
  .max(AGENT_VAULT_MAX_CUSTOM_HEADERS)
  .superRefine(addDuplicateCustomHeaderNameIssues)
  .describe(AGENT_VAULT.SESSION.inlineCustomHeaders);

const AgentVaultInlineSubstitutionsInputSchema = AgentVaultInlineSubstitutionInputSchema.array()
  .max(AGENT_VAULT_MAX_SUBSTITUTIONS)
  .superRefine(addDuplicatePlaceholderIssues)
  .describe(AGENT_VAULT.SESSION.inlineSubstitutions);

const inlineServiceNameSchema = AgentVaultNameSchema.optional().describe(AGENT_VAULT.SESSION.inlineServiceName);

const inlineServiceDescriptionSchema = AgentVaultServiceDescriptionSchema.optional().describe(
  AGENT_VAULT.SERVICE.description
);
const nativeInlineArm = <T extends TNativeServiceType>(type: T) =>
  z
    .object({
      hostPattern: AgentVaultHostPatternSchema.optional().describe(openApiHidden()),
      serverUrl: AgentVaultServerUrlSchema.optional().describe(openApiHidden()),
      transport: AgentVaultMcpTransportSchema.optional().describe(openApiHidden()),
      allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
      allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
      allowedTools: AgentVaultAllowedToolsSchema.optional().describe(openApiHidden()),
      customHeaders: AgentVaultInlineCustomHeadersInputSchema.optional().describe(openApiHidden()),
      substitutions: AgentVaultInlineSubstitutionsInputSchema.optional().describe(openApiHidden()),
      ...(type === AgentVaultServiceType.Ssh
        ? { database: hiddenNativeCreateFields.database, tls: hiddenNativeCreateFields.tls }
        : nativeDatabaseCreateFields(type)),
      type: z.literal(type).describe(AGENT_VAULT.SERVICE.type),
      // Required: the agent connects to the service by name.
      name: AgentVaultNativeNameSchema.describe(AGENT_VAULT.SERVICE.nativeName),
      description: inlineServiceDescriptionSchema,
      ...nativeCreateFields(type),
      credential: inlineCredentialInputSchema({
        mcp: false,
        native: true,
        ssh: type === AgentVaultServiceType.Ssh
      }).describe(
        type === AgentVaultServiceType.Ssh ? AGENT_VAULT.SERVICE.sshCredential : AGENT_VAULT.SERVICE.databaseCredential
      )
    })
    .describe(JSON.stringify({ title: nativeServiceTitles[type] }));

// Each option also takes the other type's fields, hidden from the docs, so the session service can refuse them with a
// message naming the field, as a bundle service's create does.
const AgentVaultInlineServiceInputSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(AgentVaultServiceType.Http).describe(AGENT_VAULT.SERVICE.type),
      name: inlineServiceNameSchema,
      description: inlineServiceDescriptionSchema,
      hostPattern: AgentVaultHostPatternSchema,
      allowedMethods: AgentVaultAllowedMethodsSchema.optional(),
      allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional(),
      credential: inlineCredentialInputSchema({ mcp: false }),
      customHeaders: AgentVaultInlineCustomHeadersInputSchema.optional(),
      substitutions: AgentVaultInlineSubstitutionsInputSchema.optional(),
      serverUrl: AgentVaultServerUrlSchema.optional().describe(openApiHidden()),
      transport: AgentVaultMcpTransportSchema.optional().describe(openApiHidden()),
      allowedTools: AgentVaultAllowedToolsSchema.optional().describe(openApiHidden()),
      ...hiddenNativeCreateFields
    })
    .describe(JSON.stringify({ title: "HTTP" })),
  z
    .object({
      type: z.literal(AgentVaultServiceType.Mcp).describe(AGENT_VAULT.SERVICE.type),
      name: inlineServiceNameSchema,
      description: inlineServiceDescriptionSchema,
      serverUrl: AgentVaultServerUrlSchema,
      transport: AgentVaultMcpTransportSchema,
      credential: inlineCredentialInputSchema({ mcp: true }).describe(AGENT_VAULT.SESSION.inlineMcpCredential),
      customHeaders: AgentVaultInlineCustomHeadersInputSchema.optional(),
      hostPattern: AgentVaultHostPatternSchema.optional().describe(openApiHidden()),
      allowedMethods: AgentVaultAllowedMethodsSchema.optional().describe(openApiHidden()),
      allowedPathPrefixes: AgentVaultAllowedPathPrefixesSchema.optional().describe(openApiHidden()),
      substitutions: AgentVaultInlineSubstitutionsInputSchema.optional().describe(openApiHidden()),
      // Refused by the session service with a message, rather than dropped, so nobody believes the tools are limited.
      allowedTools: AgentVaultAllowedToolsSchema.optional().describe(openApiHidden()),
      ...hiddenNativeCreateFields
    })
    .describe(JSON.stringify({ title: "MCP" })),
  nativeInlineArm(AgentVaultServiceType.Postgres),
  nativeInlineArm(AgentVaultServiceType.Mysql),
  nativeInlineArm(AgentVaultServiceType.Ssh)
]);

export const AgentVaultInlineServicesInputSchema = AgentVaultInlineServiceInputSchema.array()
  .max(
    AGENT_VAULT_MAX_SESSION_INLINE_SERVICES,
    `A session can have at most ${AGENT_VAULT_MAX_SESSION_INLINE_SERVICES} services. Add the others to an access bundle and name it in accessBundles.`
  )
  .superRefine((services, ctx) => {
    const seen = new Set<string>();
    services.forEach((service, index) => {
      if (!service.name) return;
      if (seen.has(service.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "name"],
          message: `More than one inline service is named "${service.name}". Give each a different name.`
        });
      }
      seen.add(service.name);
    });
  })
  .describe(AGENT_VAULT.SESSION.inlineServices);

// Each type returns only its own fields, read the same way by bundle services and a session's own services.
const serviceResponseTlsSchema = z
  .object({
    enabled: z.boolean().describe(AGENT_VAULT.SERVICE.tlsEnabled),
    verify: z.boolean().describe(AGENT_VAULT.SERVICE.tlsVerify),
    ca: z.string().nullable().describe(AGENT_VAULT.SERVICE.tlsCaRead)
  })
  .describe(AGENT_VAULT.SERVICE.tlsRead);

const serviceResponseTypeFields = {
  [AgentVaultServiceType.Http]: {
    type: z.literal(AgentVaultServiceType.Http).describe(AGENT_VAULT.SERVICE.type),
    hostPattern: z.string().describe(AGENT_VAULT.SERVICE.hostPatternRead),
    allowedMethods: z.nativeEnum(AgentVaultHttpMethod).array().nullable().describe(AGENT_VAULT.SERVICE.allowedMethods),
    allowedPathPrefixes: z.string().array().nullable().describe(AGENT_VAULT.SERVICE.allowedPathPrefixes)
  },
  [AgentVaultServiceType.Mcp]: {
    type: z.literal(AgentVaultServiceType.Mcp).describe(AGENT_VAULT.SERVICE.type),
    serverUrl: z.string().describe(AGENT_VAULT.SERVICE.serverUrlRead),
    transport: z.nativeEnum(AgentVaultMcpTransport).describe(AGENT_VAULT.SERVICE.transportRead),
    hostPattern: z.string().describe(AGENT_VAULT.SERVICE.mcpHostPatternRead)
  },
  [AgentVaultServiceType.Postgres]: {
    type: z.literal(AgentVaultServiceType.Postgres).describe(AGENT_VAULT.SERVICE.type),
    host: z.string().describe(AGENT_VAULT.SERVICE.hostRead),
    port: z.number().describe(AGENT_VAULT.SERVICE.portRead),
    database: z.string().describe(AGENT_VAULT.SERVICE.databaseRead),
    tls: serviceResponseTlsSchema
  },
  [AgentVaultServiceType.Mysql]: {
    type: z.literal(AgentVaultServiceType.Mysql).describe(AGENT_VAULT.SERVICE.type),
    host: z.string().describe(AGENT_VAULT.SERVICE.hostRead),
    port: z.number().describe(AGENT_VAULT.SERVICE.portRead),
    database: z.string().describe(AGENT_VAULT.SERVICE.databaseRead),
    tls: serviceResponseTlsSchema
  },
  [AgentVaultServiceType.Ssh]: {
    type: z.literal(AgentVaultServiceType.Ssh).describe(AGENT_VAULT.SERVICE.type),
    host: z.string().describe(AGENT_VAULT.SERVICE.hostRead),
    port: z.number().describe(AGENT_VAULT.SERVICE.portRead)
  }
};

// The sealed values are never in here, and the serializer emits only what this schema lists.
const inlineServiceResponseBase = {
  id: z.string().uuid().describe(AGENT_VAULT.SESSION.inlineServiceId),
  name: z.string().describe(AGENT_VAULT.SESSION.inlineServiceNameRead),
  description: z.string().nullable().describe(AGENT_VAULT.SERVICE.descriptionRead)
};

const inlineBearerCredentialSummarySchema = z
  .object({
    type: z.literal(AgentVaultCredentialType.Bearer),
    headerName: z.string().describe(AGENT_VAULT.SERVICE.headerName),
    headerPrefix: z.string().describe(AGENT_VAULT.SERVICE.headerPrefix)
  })
  .describe(JSON.stringify({ title: "Bearer" }));
const inlineBasicCredentialSummarySchema = (title: "Basic Auth" | "Username and Password") =>
  z.object({ type: z.literal(AgentVaultCredentialType.Basic) }).describe(JSON.stringify({ title }));

const inlineCustomHeadersResponseSchema = z
  .object({
    name: z.string().describe(AGENT_VAULT.SERVICE.customHeaderName),
    prefix: z.string().describe(AGENT_VAULT.SERVICE.customHeaderPrefix)
  })
  .array()
  .describe(AGENT_VAULT.SESSION.inlineCustomHeadersRead);

// Inline services take a type's credentials except OAuth, which needs a sign-in from the UI.
const inlineServiceResponseTypeExtras = {
  [AgentVaultServiceType.Http]: {
    credential: z.discriminatedUnion("type", [
      inlineBearerCredentialSummarySchema,
      inlineBasicCredentialSummarySchema("Basic Auth"),
      passthroughCredentialSummarySchema
    ]),
    customHeaders: inlineCustomHeadersResponseSchema,
    substitutions: z
      .object({
        placeholder: z.string().describe(AGENT_VAULT.SERVICE.placeholder),
        surfaces: z.nativeEnum(AgentVaultSubstitutionSurface).array().describe(AGENT_VAULT.SERVICE.surfaces)
      })
      .array()
      .describe(AGENT_VAULT.SESSION.inlineSubstitutionsRead)
  },
  [AgentVaultServiceType.Mcp]: {
    credential: inlineBearerCredentialSummarySchema,
    customHeaders: inlineCustomHeadersResponseSchema
  },
  [AgentVaultServiceType.Postgres]: { credential: inlineBasicCredentialSummarySchema("Username and Password") },
  [AgentVaultServiceType.Mysql]: { credential: inlineBasicCredentialSummarySchema("Username and Password") },
  [AgentVaultServiceType.Ssh]: {
    credential: z.discriminatedUnion("type", [
      inlineBasicCredentialSummarySchema("Username and Password"),
      sshKeyCredentialSummarySchema
    ])
  }
};

// One arm per type, from the fields every type shares plus that type's own extras. Arms are listed rather than
// mapped so each keeps its own type.
const serviceResponseUnion = <
  TBase extends z.ZodRawShape,
  TExtras extends { [K in AgentVaultServiceType]: z.ZodRawShape }
>(
  base: TBase,
  extras: TExtras
) =>
  z.discriminatedUnion("type", [
    z
      .object({
        ...base,
        ...serviceResponseTypeFields[AgentVaultServiceType.Http],
        ...extras[AgentVaultServiceType.Http]
      })
      .describe(JSON.stringify({ title: "HTTP" })),
    z
      .object({
        ...base,
        ...serviceResponseTypeFields[AgentVaultServiceType.Mcp],
        ...extras[AgentVaultServiceType.Mcp]
      })
      .describe(JSON.stringify({ title: "MCP" })),
    z
      .object({
        ...base,
        ...serviceResponseTypeFields[AgentVaultServiceType.Postgres],
        ...extras[AgentVaultServiceType.Postgres]
      })
      .describe(JSON.stringify({ title: nativeServiceTitles[AgentVaultServiceType.Postgres] })),
    z
      .object({
        ...base,
        ...serviceResponseTypeFields[AgentVaultServiceType.Mysql],
        ...extras[AgentVaultServiceType.Mysql]
      })
      .describe(JSON.stringify({ title: nativeServiceTitles[AgentVaultServiceType.Mysql] })),
    z
      .object({
        ...base,
        ...serviceResponseTypeFields[AgentVaultServiceType.Ssh],
        ...extras[AgentVaultServiceType.Ssh]
      })
      .describe(JSON.stringify({ title: nativeServiceTitles[AgentVaultServiceType.Ssh] }))
  ]);

export const AgentVaultInlineServiceSchema = serviceResponseUnion(
  inlineServiceResponseBase,
  inlineServiceResponseTypeExtras
);

// The service sheet's unsaved values, so the tools are listed with the credential a save would store. `serviceId`
// names the saved service whose stored values fill in what is left out.
export const AgentVaultListMcpToolsBodySchema = z.object({
  serviceId: z.string().uuid().optional().describe(AGENT_VAULT.SERVICE.serviceId),
  serverUrl: AgentVaultServerUrlSchema,
  transport: AgentVaultMcpTransportSchema,
  credential: AgentVaultMcpCredentialUpdateSchema.optional().describe(AGENT_VAULT.SERVICE.mcpCredential),
  customHeaders: AgentVaultCustomHeadersUpdateSchema.optional()
});

const variableReferenceBase = {
  variableId: z.string().uuid().describe(AGENT_VAULT.VARIABLE.variableId),
  key: z.string().describe(AGENT_VAULT.VARIABLE.key)
};

const credentialReferenceSchema = (fieldDocs: string) =>
  z
    .object({
      ...variableReferenceBase,
      field: z.enum(AGENT_VAULT_MEMBER_PROVIDED_FIELDS).describe(fieldDocs)
    })
    .describe(JSON.stringify({ title: "Credential" }));

const customHeaderReferenceSchema = (fieldDocs: string) =>
  z
    .object({
      ...variableReferenceBase,
      field: z.literal(AgentVaultVariableReferenceField.CustomHeader).describe(fieldDocs),
      customHeaderId: z.string().uuid().describe(AGENT_VAULT.SERVICE.referenceCustomHeaderId)
    })
    .describe(JSON.stringify({ title: "Custom Header" }));

const substitutionReferenceSchema = (fieldDocs: string) =>
  z
    .object({
      ...variableReferenceBase,
      field: z.literal(AgentVaultVariableReferenceField.Substitution).describe(fieldDocs),
      substitutionId: z.string().uuid().describe(AGENT_VAULT.SERVICE.referenceSubstitutionId)
    })
    .describe(JSON.stringify({ title: "Substitution" }));

// The references each type can store: only an HTTP service takes substitutions, and a database or SSH service takes
// neither them nor custom headers.
const variableReferenceSchemas = {
  [AgentVaultServiceType.Http]: z.discriminatedUnion("field", [
    credentialReferenceSchema(AGENT_VAULT.SERVICE.referenceField),
    customHeaderReferenceSchema(AGENT_VAULT.SERVICE.referenceField),
    substitutionReferenceSchema(AGENT_VAULT.SERVICE.referenceField)
  ]),
  [AgentVaultServiceType.Mcp]: z.discriminatedUnion("field", [
    credentialReferenceSchema(AGENT_VAULT.SERVICE.mcpReferenceField),
    customHeaderReferenceSchema(AGENT_VAULT.SERVICE.mcpReferenceField)
  ]),
  [AgentVaultServiceType.Postgres]: credentialReferenceSchema(AGENT_VAULT.SERVICE.nativeReferenceField),
  [AgentVaultServiceType.Mysql]: credentialReferenceSchema(AGENT_VAULT.SERVICE.nativeReferenceField),
  [AgentVaultServiceType.Ssh]: credentialReferenceSchema(AGENT_VAULT.SERVICE.nativeReferenceField)
};

const variableReferencesDocs = {
  [AgentVaultServiceType.Http]: AGENT_VAULT.SERVICE.variableReferences,
  [AgentVaultServiceType.Mcp]: AGENT_VAULT.SERVICE.mcpVariableReferences,
  [AgentVaultServiceType.Postgres]: AGENT_VAULT.SERVICE.databaseVariableReferences,
  [AgentVaultServiceType.Mysql]: AGENT_VAULT.SERVICE.databaseVariableReferences,
  [AgentVaultServiceType.Ssh]: AGENT_VAULT.SERVICE.sshVariableReferences
} as const;

// Optional where a member can read the service: they get no variableReferences rather than an empty list.
const variableReferencesField = <TType extends AgentVaultServiceType, TOptional extends boolean>(
  type: TType,
  optional: TOptional
) => {
  const references = variableReferenceSchemas[type].array();
  return (optional ? references.optional() : references).describe(
    variableReferencesDocs[type]
  ) as TOptional extends true
    ? z.ZodOptional<z.ZodArray<(typeof variableReferenceSchemas)[TType]>>
    : z.ZodArray<(typeof variableReferenceSchemas)[TType]>;
};

const serviceResponseBase = {
  id: z.string().uuid().describe(AGENT_VAULT.SERVICE.serviceId),
  accessBundleId: z.string().uuid().describe(AGENT_VAULT.ACCESS_BUNDLE.accessBundleId),
  name: z.string().describe(AGENT_VAULT.SERVICE.name),
  description: z.string().nullable().describe(AGENT_VAULT.SERVICE.descriptionRead),
  createdAt: z.date().describe(AGENT_VAULT.SERVICE.createdAt),
  updatedAt: z.date().describe(AGENT_VAULT.SERVICE.updatedAt)
};

const customHeadersResponseSchema = z
  .object({
    id: z.string().uuid().describe(AGENT_VAULT.SERVICE.customHeaderId),
    name: z.string().describe(AGENT_VAULT.SERVICE.customHeaderName),
    prefix: z.string().describe(AGENT_VAULT.SERVICE.customHeaderPrefix)
  })
  .array()
  .describe(AGENT_VAULT.SERVICE.customHeadersRead);

const serviceResponseTypeExtras = <TOptional extends boolean>(optionalReferences: TOptional) => ({
  [AgentVaultServiceType.Http]: {
    credential: credentialSummarySchemas[AgentVaultServiceType.Http],
    customHeaders: customHeadersResponseSchema,
    substitutions: z
      .object({
        id: z.string().uuid().describe(AGENT_VAULT.SERVICE.substitutionId),
        placeholder: z.string().describe(AGENT_VAULT.SERVICE.placeholder),
        surfaces: z.nativeEnum(AgentVaultSubstitutionSurface).array().describe(AGENT_VAULT.SERVICE.surfaces)
      })
      .array()
      .describe(AGENT_VAULT.SERVICE.substitutionsRead),
    variableReferences: variableReferencesField(AgentVaultServiceType.Http, optionalReferences)
  },
  [AgentVaultServiceType.Mcp]: {
    credential: credentialSummarySchemas[AgentVaultServiceType.Mcp],
    customHeaders: customHeadersResponseSchema,
    allowedTools: z.string().array().nullable().describe(AGENT_VAULT.SERVICE.allowedTools),
    variableReferences: variableReferencesField(AgentVaultServiceType.Mcp, optionalReferences)
  },
  [AgentVaultServiceType.Postgres]: {
    credential: credentialSummarySchemas[AgentVaultServiceType.Postgres],
    variableReferences: variableReferencesField(AgentVaultServiceType.Postgres, optionalReferences)
  },
  [AgentVaultServiceType.Mysql]: {
    credential: credentialSummarySchemas[AgentVaultServiceType.Mysql],
    variableReferences: variableReferencesField(AgentVaultServiceType.Mysql, optionalReferences)
  },
  [AgentVaultServiceType.Ssh]: {
    credential: credentialSummarySchemas[AgentVaultServiceType.Ssh],
    variableReferences: variableReferencesField(AgentVaultServiceType.Ssh, optionalReferences)
  }
});

// The sealed value is never in here. This schema is the last thing between the encrypted column and the
// wire on every service route: the serializer emits `result.data`, so anything absent here is dropped,
// and anything required here but missing from a projection is a 500 rather than a leak. `extra` adds or
// replaces fields every type shares, as a discriminated union can't be extended afterwards.
export const agentVaultServiceResponseSchema = <T extends z.ZodRawShape, TOptional extends boolean>(
  extra: T,
  { optionalVariableReferences }: { optionalVariableReferences: TOptional }
) => serviceResponseUnion({ ...serviceResponseBase, ...extra }, serviceResponseTypeExtras(optionalVariableReferences));

export const AgentVaultServiceSchema = agentVaultServiceResponseSchema({}, { optionalVariableReferences: false });

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
      type: z.nativeEnum(AgentVaultServiceType).describe(AGENT_VAULT.VARIABLE.usedByServiceType),
      hostPattern: z.string().nullable().describe(AGENT_VAULT.VARIABLE.usedByServiceHostPattern),
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
          .describe(AGENT_VAULT.PERSONAL_VALUE.variableReferences),
        oauth: z
          .object({
            status: z.nativeEnum(AgentVaultOauthStatus).describe(AGENT_VAULT.PERSONAL_VALUE.oauthStatus),
            issuer: z.string().describe(AGENT_VAULT.SERVICE.oauthIssuer),
            grantedScopes: z.string().array().describe(AGENT_VAULT.SERVICE.oauthGrantedScopes),
            requiredScopes: z.string().array().describe(AGENT_VAULT.PERSONAL_VALUE.oauthRequiredScopes),
            expiresAt: z.string().nullable().describe(AGENT_VAULT.PERSONAL_VALUE.oauthExpiresAt),
            authorizedAt: z.string().nullable().describe(AGENT_VAULT.PERSONAL_VALUE.oauthAuthorizedAt),
            lastError: z.string().nullable().describe(AGENT_VAULT.PERSONAL_VALUE.oauthLastError)
          })
          .nullable()
          .describe(AGENT_VAULT.PERSONAL_VALUE.oauth)
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

const namedCount = (body: {
  userIds: string[];
  machineIdentityIds: string[];
  groupIds: string[];
  emails?: string[];
  usernames?: string[];
}) =>
  body.userIds.length +
  body.machineIdentityIds.length +
  body.groupIds.length +
  (body.emails?.length ?? 0) +
  (body.usernames?.length ?? 0);

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

// One object, not an intersection: zod parses each side on its own, so the id side would strip emails and
// usernames before the refines ran, failing a body that names only those and leaving the cap blind to them.
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
    usernames: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .array()
      .default([])
      .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase")
      .describe(AGENT_VAULT.MEMBERSHIP.usernames),
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

// Shaped like a session's user actor, so a client shows the user a session acts for the way it shows an owner.
export const AgentVaultSessionOnBehalfOfSchema = sessionActorSchemas.user.extend({
  type: z.literal(AgentVaultMemberType.User).describe(AGENT_VAULT.SESSION.onBehalfOfType),
  id: z.string().uuid().nullable().describe(AGENT_VAULT.SESSION.onBehalfOfUserIdRead)
});

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
  memberActorSchemas.user.extend({
    isOrgMembershipPending: z.boolean().describe(AGENT_VAULT.MEMBER.isOrgMembershipPending),
    grantedAt: grantedAtSchema
  }),
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

export const AgentVaultProjectIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(36)
  .optional()
  .describe(AGENT_VAULT.projectId);
