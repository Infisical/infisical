import * as x509 from "@peculiar/x509";
import { z } from "zod";

import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/helpers/agentVaultControlChars";
import { agentVaultServiceDescriptionSchema } from "@app/helpers/agentVaultDescription";
import { addHostIssues, hostError } from "@app/helpers/agentVaultHostPattern";
import { addPathPrefixIssues, pathPrefixError } from "@app/helpers/agentVaultPathPrefix";
import { variableReferenceError } from "@app/helpers/agentVaultVariables";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField,
  isNativeServiceType,
  TAgentVaultMemberProvidedField,
  TAgentVaultNativeServiceType
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultService,
  TAgentVaultSessionInlineService,
  TAgentVaultSharedOauthCredentialSummary
} from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

/**
 * Seeded into a secret field on edit so the box can show that something is stored without the server
 * returning it. Never sent: the sheet maps it back to an omitted key.
 */
export const UNCHANGED_SECRET = "__INFISICAL_UNCHANGED__";

/** The type of a save error on `oauthAuthorizationId` that the OAuth card answers by showing its own-app fields. */
export const OAUTH_OWN_APP_REQUIRED_ERROR = "own-app-required";

/** The API stores :443 explicitly, so it is stripped wherever a host pattern is shown and put back on save. */
export const displayHostPattern = (hostPattern: string) =>
  hostPattern
    .split(",")
    .map((host) => host.trim().replace(/:443$/, ""))
    .join(", ");

/**
 * The form field that holds each member-provided field's admin value. credential-value is a bearer token or a basic
 * password, which share the form's `secret`.
 */
export const FORM_FIELD_OF_CREDENTIAL_FIELD: Record<
  TAgentVaultMemberProvidedField,
  "secret" | "username"
> = {
  [AgentVaultVariableReferenceField.CredentialValue]: "secret",
  [AgentVaultVariableReferenceField.CredentialUsername]: "username"
};

/** The member-provided fields a service had when the sheet opened. None stand behind a stored value. */
export const storedMemberFields = (
  service?: TAgentVaultService | null
): TAgentVaultMemberProvidedField[] =>
  service &&
  service.credential.type !== AgentVaultCredentialType.Passthrough &&
  service.credential.type !== AgentVaultCredentialType.SshKey
    ? (service.credential.memberProvidedFields ?? [])
    : [];

export const isMemberProvidedOAuthService = (service?: TAgentVaultService | null) =>
  service?.credential.type === AgentVaultCredentialType.OAuth &&
  storedMemberFields(service).length > 0;

export const isNativeService = (
  service?: TAgentVaultService | null
): service is Extract<TAgentVaultService, { type: TAgentVaultNativeServiceType }> =>
  isNativeServiceType(service?.type);

/** A database or SSH service is reached by name, so only an HTTP or MCP service has a host pattern. */
export const hostPatternOf = (service: TAgentVaultService | TAgentVaultSessionInlineService) =>
  service.type === AgentVaultServiceType.Http || service.type === AgentVaultServiceType.Mcp
    ? service.hostPattern
    : null;

export const serverUrlOf = (service?: TAgentVaultService | null) =>
  service?.type === AgentVaultServiceType.Mcp ? service.serverUrl : null;

export const hostOf = (serverUrl: string) => {
  try {
    return new URL(serverUrl.trim()).host;
  } catch {
    return "the server";
  }
};

export const CREDENTIAL_LABELS: Record<AgentVaultCredentialType, string> = {
  [AgentVaultCredentialType.Bearer]: "Bearer",
  [AgentVaultCredentialType.Basic]: "Basic Auth",
  [AgentVaultCredentialType.Passthrough]: "Pass-through",
  [AgentVaultCredentialType.OAuth]: "OAuth",
  [AgentVaultCredentialType.SshKey]: "SSH Key"
};

// A database or SSH login has no HTTP header, so "Basic Auth" would misdescribe it.
const DATABASE_CREDENTIAL_LABELS: Partial<Record<AgentVaultCredentialType, string>> = {
  [AgentVaultCredentialType.Basic]: "Username and Password"
};

// Beside SSH Key, "Password" is the choice being made; the username is entered either way.
const SSH_CREDENTIAL_LABELS: Partial<Record<AgentVaultCredentialType, string>> = {
  [AgentVaultCredentialType.Basic]: "Password",
  [AgentVaultCredentialType.SshKey]: "SSH Key"
};

export const nativeCredentialLabels = (serviceType: TAgentVaultNativeServiceType) =>
  serviceType === AgentVaultServiceType.Ssh ? SSH_CREDENTIAL_LABELS : DATABASE_CREDENTIAL_LABELS;

export const credentialLabel = (
  serviceType: AgentVaultServiceType,
  credentialType: AgentVaultCredentialType
) =>
  (isNativeServiceType(serviceType) && nativeCredentialLabels(serviceType)[credentialType]) ||
  CREDENTIAL_LABELS[credentialType];

export const NATIVE_CREDENTIAL_TYPES: Record<
  TAgentVaultNativeServiceType,
  AgentVaultCredentialType[]
> = {
  [AgentVaultServiceType.Postgres]: [AgentVaultCredentialType.Basic],
  [AgentVaultServiceType.Mysql]: [AgentVaultCredentialType.Basic],
  [AgentVaultServiceType.Ssh]: [AgentVaultCredentialType.Basic, AgentVaultCredentialType.SshKey]
};

export const HTTP_CREDENTIAL_TYPES = [
  AgentVaultCredentialType.Bearer,
  AgentVaultCredentialType.Basic,
  AgentVaultCredentialType.Passthrough
];

export const OAUTH_STATUS_LABELS: Record<AgentVaultOauthStatus, string> = {
  [AgentVaultOauthStatus.Connected]: "Authorized",
  [AgentVaultOauthStatus.NeedsReauthorization]: "Needs Reauthorization",
  [AgentVaultOauthStatus.NeedsAdditionalScopes]: "Missing Scopes"
};

export const SERVICE_TYPE_LABELS: Record<AgentVaultServiceType, string> = {
  [AgentVaultServiceType.Http]: "HTTP API",
  [AgentVaultServiceType.Mcp]: "MCP Server",
  [AgentVaultServiceType.Postgres]: "PostgreSQL",
  [AgentVaultServiceType.Mysql]: "MySQL",
  [AgentVaultServiceType.Ssh]: "SSH"
};

export type TServiceKind = "http" | "mcp" | "native";

export const serviceKindOf = (serviceType: AgentVaultServiceType): TServiceKind => {
  if (serviceType === AgentVaultServiceType.Mcp) return "mcp";
  if (isNativeServiceType(serviceType)) return "native";
  return "http";
};

export const hasDatabase = (serviceType: AgentVaultServiceType) =>
  serviceType === AgentVaultServiceType.Postgres || serviceType === AgentVaultServiceType.Mysql;

// The agent reaches a database or SSH service at `<name>.svc.agent-vault`, and a DNS label stops at 63 bytes.
export const MAX_NATIVE_SERVICE_NAME_LENGTH = 63;

// Mirrors agent-vault-native-config-schemas.ts on the backend, so a value the API would refuse is marked on its
// field instead of coming back as a toast on Review.
const MAX_NATIVE_HOST_LENGTH = 253;
const MAX_NATIVE_DATABASE_LENGTH = 64;
const MAX_NATIVE_CA_LENGTH = 16384;
const MAX_SSH_KEY_LENGTH = 8192;
const MAX_SSH_USERNAME_LENGTH = 256;

const NATIVE_HOSTNAME_RE =
  /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?)*$/i;
const IPV6_SCHEMA = z.string().ip({ version: "v6" });
// A PEM spans lines, so only those control characters are allowed.
// eslint-disable-next-line no-control-regex
const PEM_CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const PEM_BLOCK_RE = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

const SSH_KEY_VARIABLE_MESSAGE =
  "An SSH key credential can't use variables yet, so this can't contain double braces. Enter the value itself.";
// A key spans lines, so only tabs and line breaks are allowed among the control characters.
// eslint-disable-next-line no-control-regex
const SSH_KEY_TEXT_RE = /^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]*$/;

export const nativeHostError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the server's host name or IP address.";
  if (trimmed.length > MAX_NATIVE_HOST_LENGTH) {
    return `The host can be at most ${MAX_NATIVE_HOST_LENGTH} characters.`;
  }
  const unbracketed =
    trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  const host = unbracketed.replace(/\.$/, "").toLowerCase();
  if (/\s/.test(host) || !AGENT_VAULT_NO_CONTROL_CHARS_RE.test(host)) {
    return "The host can't contain spaces or control characters.";
  }
  if (host.includes("{{")) {
    return "Variables aren't supported in the host yet. Enter the host itself.";
  }
  if (IPV6_SCHEMA.safeParse(host).success) return null;
  if (host.includes("://")) return "Enter only the host, without a scheme such as postgres://.";
  if (host.includes("/")) return "Enter only the host, without a path.";
  if (host.includes("*")) return "Enter one specific host. Wildcards aren't supported here.";
  if (host.includes(":")) return "Enter the port in the Port field, not as part of the host.";
  if (!NATIVE_HOSTNAME_RE.test(host)) return `"${host}" isn't a valid host name or IP address.`;
  return null;
};

export const nativePortError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the port.";
  const port = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || port < 1 || port > 65535) {
    return "The port must be a whole number between 1 and 65535.";
  }
  return null;
};

export const nativeDatabaseError = (value: string): string | null => {
  const database = value.trim();
  if (!database) return "Enter the database to connect to.";
  if (database.length > MAX_NATIVE_DATABASE_LENGTH) {
    return `The database name can be at most ${MAX_NATIVE_DATABASE_LENGTH} characters.`;
  }
  if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(database)) {
    return "The database name can't contain control characters.";
  }
  if (database.includes("{{")) {
    return "Variables aren't supported in the database name yet. Enter the name itself.";
  }
  return null;
};

export const certificateAuthorityError = (value: string): string | null => {
  const pem = value.replace(/\r\n?/g, "\n").trim();
  if (!pem) return null;
  if (pem.length > MAX_NATIVE_CA_LENGTH) {
    return `The certificate authority can be at most ${MAX_NATIVE_CA_LENGTH} characters.`;
  }
  const invalid =
    "The certificate authority isn't a valid PEM certificate. Paste the CA certificate, starting with -----BEGIN CERTIFICATE-----.";
  if (PEM_CONTROL_CHARS_RE.test(pem)) return invalid;
  const blocks = pem.match(PEM_BLOCK_RE);
  if (!blocks?.length) return invalid;
  if ((pem.match(/-----BEGIN /g) ?? []).length !== blocks.length) {
    return "Paste only the CA certificate. This text also contains a private key or other data that isn't a certificate.";
  }
  try {
    blocks.forEach((block) => new x509.X509Certificate(block));
  } catch {
    return invalid;
  }
  return null;
};

const hasSshKeyVariable = (value: string) => value.includes("{{") || value.includes("}}");

const sshKeyTextError = (value: string): string | null => {
  if (hasSshKeyVariable(value)) return SSH_KEY_VARIABLE_MESSAGE;
  if (value.trim().length > MAX_SSH_KEY_LENGTH) {
    return `This can be at most ${MAX_SSH_KEY_LENGTH} characters.`;
  }
  if (!SSH_KEY_TEXT_RE.test(value)) {
    return "This can't contain control characters other than line breaks. Paste the key file's contents as they are.";
  }
  return null;
};

// A username is one line, unlike the key and certificate.
const sshUsernameError = (value: string): string | null => {
  if (hasSshKeyVariable(value)) return SSH_KEY_VARIABLE_MESSAGE;
  const username = value.trim();
  if (username.length > MAX_SSH_USERNAME_LENGTH) {
    return `This can be at most ${MAX_SSH_USERNAME_LENGTH} characters.`;
  }
  if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(username)) return AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE;
  return null;
};

export const TRANSPORT_LABELS: Record<AgentVaultMcpTransport, string> = {
  [AgentVaultMcpTransport.StreamableHttp]: "Streamable HTTP",
  [AgentVaultMcpTransport.Sse]: "SSE"
};

export const HTTP_METHODS = Object.values(AgentVaultHttpMethod);

/** Every method selected is stored as allowedMethods: null, so "All" is a view of the list, not a flag beside it. */
export const isAllMethods = (methods: AgentVaultHttpMethod[]) =>
  methods.length === HTTP_METHODS.length;

// Mirrors AGENT_VAULT_MAX_CUSTOM_HEADERS / AGENT_VAULT_MAX_SUBSTITUTIONS / AGENT_VAULT_MAX_PATH_PREFIXES on the
// backend. Without these the only thing enforcing the cap is the server, and its rejection names an array
// root that no field renders.
export const MAX_CUSTOM_HEADERS = 20;
export const MAX_SUBSTITUTIONS = 20;
export const MAX_PATH_PREFIXES = 20;

// The column holds every host as one comma-joined string, so this caps the join, not any single host.
const AGENT_VAULT_MAX_HOST_PATTERN_LENGTH = 1024;

const MAX_SERVER_URL_LENGTH = 2048;

export enum McpToolScope {
  All = "all",
  Selected = "selected"
}

// Mirrors agent-vault-tool-name-schemas.ts on the backend: the MCP spec's recommended tool name characters, held as
// a must. The proxy compares names exactly.
export const MAX_ALLOWED_TOOLS = 500;
const MAX_TOOL_NAME_LENGTH = 128;

// Not trimmed: names are exact and case-sensitive, so a stray space is refused rather than quietly dropped.
export const toolNameError = (name: string): string | null => {
  if (!name) return "Enter a tool name.";
  if (name.length > MAX_TOOL_NAME_LENGTH) {
    return `A tool name can be at most ${MAX_TOOL_NAME_LENGTH} characters.`;
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    return "A tool name can only contain letters, numbers, underscores (_), hyphens (-), and dots (.).";
  }
  return null;
};

export const serverUrlError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the server URL.";
  if (trimmed.length > MAX_SERVER_URL_LENGTH) {
    return `A server URL can be at most ${MAX_SERVER_URL_LENGTH} characters.`;
  }
  if (/\s/.test(trimmed)) return "The server URL can't contain spaces.";
  // On the raw text: the URL parser reads "https:host" as if it were "https://host".
  if (!/^https:\/\//i.test(trimmed)) {
    return "The server URL must start with https://, as in https://mcp.example.com/mcp.";
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Enter a full URL, as in https://mcp.example.com/mcp.";
  }
  if (url.username || url.password) {
    return "Remove the credentials from the URL. Add them on the Credential step instead.";
  }
  if (trimmed.includes("#")) return "Remove the # fragment from the URL.";
  if (trimmed.includes("?")) {
    return "Server URLs can't include a query string, since it is stored and shown in plaintext. Put a token in the Bearer token or a custom header instead.";
  }
  // The URL parser percent-encodes the *, so the hostname carries %2A.
  if (/\*|%2a/i.test(url.hostname))
    return "The server URL must name a specific host, not a wildcard.";
  return null;
};

export const SURFACE_LABELS: Record<AgentVaultSubstitutionSurface, string> = {
  [AgentVaultSubstitutionSurface.Path]: "URL Path",
  [AgentVaultSubstitutionSurface.Query]: "Query String",
  [AgentVaultSubstitutionSurface.Header]: "Headers",
  [AgentVaultSubstitutionSurface.Body]: "Body"
};

// Double braces wrap a variable reference, and neither a prefix nor a placeholder takes one.
// The client ID and secret go to the provider as typed, unlike the credential fields that take `{{KEY}}`.
export const OAUTH_CLIENT_VARIABLES_MESSAGE = "Variables aren't supported here. Paste the value.";

// RFC 6749's VSCHAR, which the API requires, so a pasted smart quote is caught here rather than as a 422.
const OAUTH_CLIENT_CHARS_RE = /^[\x20-\x7e]*$/;
const OAUTH_CLIENT_CHARS_MESSAGE = "Use printable ASCII characters without line breaks or accents.";

// Shared with the Authorize card, which checks them before it opens the sign-in window.
export const oauthClientIdSchema = z
  .string()
  .trim()
  .max(2048, "A client ID can be at most 2048 characters.")
  .regex(OAUTH_CLIENT_CHARS_RE, OAUTH_CLIENT_CHARS_MESSAGE)
  .refine((value) => !value.includes("{{"), OAUTH_CLIENT_VARIABLES_MESSAGE);

export const oauthClientSecretSchema = z
  .string()
  .max(4096, "A client secret can be at most 4096 characters.")
  .regex(OAUTH_CLIENT_CHARS_RE, OAUTH_CLIENT_CHARS_MESSAGE)
  .refine((value) => !value.includes("{{"), OAUTH_CLIENT_VARIABLES_MESSAGE);

const hasDoubleBraces = (text: string) => text.includes("{{") || text.includes("}}");

const PREFIX_BRACES_MESSAGE =
  "A prefix can't contain {{ or }}. Put a variable reference in the value instead.";

// Set by the proxy on every request, so naming one here would either be dropped or corrupt the request.
const RESERVED_HEADER_NAMES = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "proxy-connection",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization"
]);

export enum ServiceStep {
  Template = "template",
  Details = "details",
  Credential = "credential",
  Tools = "tools",
  Review = "review"
}

export const SERVICE_STEP_FIELDS: Record<ServiceStep, string[]> = {
  [ServiceStep.Template]: [],
  [ServiceStep.Details]: [
    "name",
    "description",
    "hosts",
    "hostDraft",
    "methods",
    "pathPrefixes",
    "pathDraft"
  ],
  [ServiceStep.Credential]: [
    "credentialType",
    "headerName",
    "headerPrefix",
    "username",
    "secret",
    "memberProvidedFields",
    "customHeaders",
    "substitutions"
  ],
  [ServiceStep.Tools]: [],
  [ServiceStep.Review]: []
};

export const NATIVE_SERVICE_STEP_FIELDS: Record<ServiceStep, string[]> = {
  [ServiceStep.Template]: [],
  [ServiceStep.Details]: [
    "name",
    "description",
    "host",
    "port",
    "database",
    "tlsEnabled",
    "tlsVerify",
    "tlsCa"
  ],
  [ServiceStep.Credential]: [
    "credentialType",
    "username",
    "secret",
    "memberProvidedFields",
    "sshPrivateKey",
    "sshCertificate"
  ],
  [ServiceStep.Tools]: [],
  [ServiceStep.Review]: []
};

export const MCP_SERVICE_STEP_FIELDS: Record<ServiceStep, string[]> = {
  [ServiceStep.Template]: [],
  [ServiceStep.Details]: ["name", "description", "serverUrl", "transport"],
  [ServiceStep.Credential]: [
    "credentialType",
    "headerName",
    "headerPrefix",
    "secret",
    "memberProvidedFields",
    "oauthAuthorizationId",
    "oauthClientId",
    "oauthClientSecret",
    "customHeaders"
  ],
  [ServiceStep.Tools]: ["toolScope", "allowedTools"],
  [ServiceStep.Review]: []
};

// Spelled out rather than picked from TServiceForm, which is inferred from the schema that calls these.
type TOAuthFormState = {
  serverUrl: string;
  oauthAuthorizationId: string;
  oauthAuthorizedUrl: string;
  memberProvidedFields: TAgentVaultMemberProvidedField[];
};

/** For an MCP service, credential-value stands for the whole credential: the bearer token or the OAuth sign-in. */
export const isCredentialMemberProvided = (form: {
  memberProvidedFields: TAgentVaultMemberProvidedField[];
}) => form.memberProvidedFields.includes(AgentVaultVariableReferenceField.CredentialValue);

// Reusing an authorization after the server URL changes could attach its tokens to another host.
export const newOAuthAuthorizationId = (
  form: Pick<TOAuthFormState, "serverUrl" | "oauthAuthorizationId" | "oauthAuthorizedUrl">
) =>
  form.oauthAuthorizationId && form.oauthAuthorizedUrl === form.serverUrl.trim()
    ? form.oauthAuthorizationId
    : undefined;

// The admin's own sign-in. A service that leaves the sign-in to each member stores none.
export const storedOAuthCredential = (
  service: TAgentVaultService | null | undefined,
  serverUrl: string
): TAgentVaultSharedOauthCredentialSummary | null =>
  service?.type === AgentVaultServiceType.Mcp &&
  service.credential.type === AgentVaultCredentialType.OAuth &&
  service.credential.status !== undefined &&
  !isMemberProvidedOAuthService(service) &&
  service.serverUrl === serverUrl.trim()
    ? (service.credential as TAgentVaultSharedOauthCredentialSummary)
    : null;

export const isOAuthAuthorizationMissing = (
  form: TOAuthFormState & {
    serviceType: AgentVaultServiceType;
    credentialType: AgentVaultCredentialType;
  },
  service?: TAgentVaultService | null
) => {
  if (
    form.serviceType !== AgentVaultServiceType.Mcp ||
    form.credentialType !== AgentVaultCredentialType.OAuth ||
    isCredentialMemberProvided(form)
  ) {
    return false;
  }
  return !newOAuthAuthorizationId(form) && !storedOAuthCredential(service, form.serverUrl);
};

export const oauthStatusLabel = (form: TOAuthFormState, service?: TAgentVaultService | null) => {
  if (isCredentialMemberProvided(form)) return "Each member connects their own account";
  const stored = storedOAuthCredential(service, form.serverUrl);
  if (newOAuthAuthorizationId(form)) return stored ? "Reauthorized" : "Authorized";
  return stored ? OAUTH_STATUS_LABELS[stored.status] : "Not authorized";
};

/**
 * Missing keys are read when the form validates rather than when the schema is built, since they arrive as each
 * lookup answers. A key still being checked passes here; the API refuses it on save if it doesn't exist.
 */
export const buildServiceSchema = (
  service?: TAgentVaultService | null,
  getMissingKeys?: () => ReadonlySet<string>
) =>
  z
    .object({
      serviceType: z.nativeEnum(AgentVaultServiceType),
      name: slugSchema({ max: 64, field: "Name" }),
      description: agentVaultServiceDescriptionSchema,
      serverUrl: z.string(),
      transport: z.nativeEnum(AgentVaultMcpTransport),
      hosts: z.array(z.string()),
      // A database or SSH service's server. The port stays text so a half-typed value can be shown and refused.
      host: z.string(),
      port: z.string(),
      database: z.string(),
      tlsEnabled: z.boolean(),
      tlsVerify: z.boolean(),
      tlsCa: z.string(),
      sshPrivateKey: z.string(),
      sshCertificate: z.string(),
      // Set only by Remove Certificate: an emptied box keeps the stored certificate, as every other stored value does.
      sshCertificateRemoved: z.boolean(),
      // In the form rather than component state so the resolver sees it: trigger() wipes anything set with
      // setError, so a refusal held outside the form would let the step advance.
      hostDraft: z.string(),
      pathDraft: z.string(),
      // Kept while All is chosen, so switching back restores the picks. Only Selected sends them.
      toolScope: z.nativeEnum(McpToolScope),
      allowedTools: z.array(z.string()),
      credentialType: z.nativeEnum(AgentVaultCredentialType),
      // Checked in superRefine, only while Bearer is selected: switching away hides these fields but keeps them.
      headerName: z.string().trim().optional(),
      headerPrefix: z.string().trim().optional(),
      username: z.string().trim().max(256).optional(),
      secret: z.string().max(8192).optional(),
      oauthAuthorizationId: z.string(),
      // The server URL the authorization was made for, so editing the URL afterwards asks for a new one.
      oauthAuthorizedUrl: z.string(),
      oauthScopes: z.array(z.string()),
      // Why a new authorization was dropped (expired, or refused on save). While set, the stored login doesn't
      // count, so the save can't quietly keep the old one.
      oauthAuthorizationRejection: z.string().optional(),
      // Checked in the refine below, only while OAuth is selected: switching to Bearer keeps these values.
      oauthClientId: z.string().optional(),
      oauthClientSecret: z.string().optional(),
      // The admin chose automatic setup over the service's own OAuth app. Kept in the form so it survives Back.
      oauthAutomaticSetup: z.boolean().optional(),
      // Each member sets these for themselves, so the form holds no value for them.
      memberProvidedFields: z.array(
        z.enum([
          AgentVaultVariableReferenceField.CredentialValue,
          AgentVaultVariableReferenceField.CredentialUsername
        ])
      ),
      methods: z.array(z.nativeEnum(AgentVaultHttpMethod)),
      pathPrefixes: z
        .array(z.string())
        .max(MAX_PATH_PREFIXES, `You can add at most ${MAX_PATH_PREFIXES} path prefixes.`),
      customHeaders: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string().trim().max(128),
            prefix: z.string().trim().max(64),
            value: z.string().max(8192)
          })
        )
        .max(MAX_CUSTOM_HEADERS, `You can add at most ${MAX_CUSTOM_HEADERS} custom headers.`),
      substitutions: z
        .array(
          z.object({
            id: z.string().optional(),
            placeholder: z.string().trim().max(255),
            value: z.string().max(8192),
            surfaces: z.array(z.nativeEnum(AgentVaultSubstitutionSurface))
          })
        )
        .max(MAX_SUBSTITUTIONS, `You can add at most ${MAX_SUBSTITUTIONS} substitutions.`)
    })
    .superRefine((data, ctx) => {
      const isMcp = data.serviceType === AgentVaultServiceType.Mcp;
      const isHttp = data.serviceType === AgentVaultServiceType.Http;
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      if (isNativeServiceType(data.serviceType)) {
        if (data.name.length > MAX_NATIVE_SERVICE_NAME_LENGTH) {
          issue(
            "name",
            `A database or SSH service's name can be at most ${MAX_NATIVE_SERVICE_NAME_LENGTH} characters.`
          );
        }
        const hostIssue = nativeHostError(data.host);
        if (hostIssue) issue("host", hostIssue);
        const portIssue = nativePortError(data.port);
        if (portIssue) issue("port", portIssue);
        if (hasDatabase(data.serviceType)) {
          const databaseIssue = nativeDatabaseError(data.database);
          if (databaseIssue) issue("database", databaseIssue);
          // The CA field is hidden unless the proxy verifies the certificate, and nothing sends it then.
          const caIssue =
            data.tlsEnabled && data.tlsVerify ? certificateAuthorityError(data.tlsCa) : null;
          if (caIssue) issue("tlsCa", caIssue);
        }
        if (!NATIVE_CREDENTIAL_TYPES[data.serviceType].includes(data.credentialType)) {
          issue(
            "credentialType",
            data.serviceType === AgentVaultServiceType.Ssh
              ? "An SSH service takes a password or an SSH key."
              : "A database service takes a username and password."
          );
        }
      }
      if (isMcp) {
        const urlError = serverUrlError(data.serverUrl);
        if (urlError) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serverUrl"], message: urlError });
        }
        if (
          data.credentialType !== AgentVaultCredentialType.Bearer &&
          data.credentialType !== AgentVaultCredentialType.OAuth
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["credentialType"],
            message: "An MCP server takes OAuth or a bearer token."
          });
        }
        if (data.credentialType === AgentVaultCredentialType.OAuth) {
          if (isCredentialMemberProvided(data)) {
            if (data.oauthClientSecret && !data.oauthClientId?.trim()) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["oauthClientId"],
                message: "Enter the client ID this secret belongs to."
              });
            }
          } else if (data.oauthAuthorizationRejection && !data.oauthAuthorizationId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["oauthAuthorizationId"],
              message: data.oauthAuthorizationRejection
            });
          } else if (isOAuthAuthorizationMissing(data, service)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["oauthAuthorizationId"],
              message: "Authorize the server to continue."
            });
          }
          (
            [
              ["oauthClientId", oauthClientIdSchema, data.oauthClientId],
              ["oauthClientSecret", oauthClientSecretSchema, data.oauthClientSecret]
            ] as const
          ).forEach(([field, fieldSchema, value]) => {
            const result = fieldSchema.safeParse(value ?? "");
            if (!result.success) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: result.error.issues[0].message
              });
            }
          });
        }
      }

      if (isMcp && data.toolScope === McpToolScope.Selected) {
        if (data.allowedTools.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowedTools"],
            message: "Select at least one tool, or turn on All Tools."
          });
        } else if (data.allowedTools.length > MAX_ALLOWED_TOOLS) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["allowedTools"],
            message: `You can select at most ${MAX_ALLOWED_TOOLS} tools.`
          });
        }
        const seenTools = new Set<string>();
        data.allowedTools.forEach((name) => {
          const nameError = toolNameError(name);
          let message: string | null = null;
          if (nameError) message = name ? `"${name}": ${nameError}` : nameError;
          else if (seenTools.has(name)) message = `"${name}" is listed twice.`;
          seenTools.add(name);
          if (message) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedTools"], message });
          }
        });
      }

      if (isHttp) addHostIssues(data.hosts, ctx, ["hosts"]);
      const hostDraft = isHttp ? data.hostDraft.trim() : "";
      if (hostDraft) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hosts"],
          message: hostError(hostDraft, data.hosts) ?? `Add "${hostDraft}" or clear it.`
        });
      } else if (isHttp && data.hosts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hosts"],
          message: "Add at least one host."
        });
      }

      const pathDraft = isHttp ? data.pathDraft.trim() : "";
      if (pathDraft) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pathPrefixes"],
          message:
            pathPrefixError(pathDraft, data.pathPrefixes) ?? `Add "${pathDraft}" or clear it.`
        });
      }
      if (data.hosts.join(",").length > AGENT_VAULT_MAX_HOST_PATTERN_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hosts"],
          message: `These hosts come to more than ${AGENT_VAULT_MAX_HOST_PATTERN_LENGTH} characters together. Remove a few.`
        });
      }

      if (isHttp && data.methods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["methods"],
          message: "Select at least one method."
        });
      }

      if (isHttp) addPathPrefixIssues(data.pathPrefixes, ctx, ["pathPrefixes"]);

      const hasHeaderShape = data.credentialType === AgentVaultCredentialType.Bearer;

      let credentialHeader: string | null = null;
      if (hasHeaderShape) {
        credentialHeader = data.headerName || "Authorization";
      } else if (
        data.credentialType === AgentVaultCredentialType.Basic ||
        data.credentialType === AgentVaultCredentialType.OAuth
      ) {
        credentialHeader = "Authorization";
      }

      if (hasHeaderShape && data.headerName) {
        if (data.headerName.length > 128) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["headerName"],
            message: "A header name can be at most 128 characters."
          });
        } else if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]*$/.test(data.headerName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["headerName"],
            message:
              "A header name can't contain spaces or colons. Use letters, digits and dashes, as in X-API-Key."
          });
        }
      }

      if (hasHeaderShape && data.headerPrefix && data.headerPrefix.length > 64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["headerPrefix"],
          message: "A prefix can be at most 64 characters."
        });
      }

      // Basic and OAuth always write Authorization, which is not reserved, so only bearer can name one.
      if (
        hasHeaderShape &&
        data.headerName &&
        RESERVED_HEADER_NAMES.has(data.headerName.toLowerCase())
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["headerName"],
          message: "This header is set by the proxy and can't be overridden."
        });
      }

      if (hasHeaderShape && data.headerPrefix && hasDoubleBraces(data.headerPrefix)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["headerPrefix"],
          message: PREFIX_BRACES_MESSAGE
        });
      }

      const seenHeaders = new Set<string>();
      data.customHeaders.forEach((header, index) => {
        const at = (field: string, message: string) =>
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["customHeaders", index, field],
            message
          });

        if (!header.name) {
          at("name", "Required");
        } else if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(header.name)) {
          at(
            "name",
            "A header name can't contain spaces or colons. Use letters, digits and dashes."
          );
        } else if (RESERVED_HEADER_NAMES.has(header.name.toLowerCase())) {
          at("name", "This header is set by the proxy and can't be overridden.");
        } else if (
          credentialHeader &&
          header.name.toLowerCase() === credentialHeader.toLowerCase()
        ) {
          at("name", `The ${credentialHeader} header is already set by the credential.`);
        } else if (seenHeaders.has(header.name.toLowerCase())) {
          at("name", "This header is listed twice.");
        }
        seenHeaders.add(header.name.toLowerCase());

        if (!header.value) at("value", "Required");
        // A pasted key with a trailing newline saves fine but then makes Go refuse to send the header.
        else if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(header.value))
          at("value", AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);

        if (header.prefix && !AGENT_VAULT_NO_CONTROL_CHARS_RE.test(header.prefix)) {
          at("prefix", AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);
        } else if (header.prefix && hasDoubleBraces(header.prefix)) {
          at("prefix", PREFIX_BRACES_MESSAGE);
        }
      });

      const seenPlaceholders = new Set<string>();
      data.substitutions.forEach((substitution, index) => {
        const at = (field: string, message: string) =>
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["substitutions", index, field],
            message
          });

        if (!substitution.placeholder) {
          at("placeholder", "Required");
        } else if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(substitution.placeholder)) {
          at("placeholder", AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);
        } else if (hasDoubleBraces(substitution.placeholder)) {
          at(
            "placeholder",
            "A placeholder can't contain {{ or }}. Double braces are reserved for variable references."
          );
        } else if (seenPlaceholders.has(substitution.placeholder)) {
          at("placeholder", "This placeholder is listed twice.");
        }
        seenPlaceholders.add(substitution.placeholder);

        if (!substitution.value) at("value", "Required");
        else if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(substitution.value))
          at("value", AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);
        if (substitution.surfaces.length === 0) {
          at("surfaces", "Pick at least one place to look for the placeholder.");
        }
      });

      const missingKeys = getMissingKeys?.();
      const addReferenceIssue = (value: string | undefined, path: (string | number)[]) => {
        if (!value || value === UNCHANGED_SECRET) return;
        const message = variableReferenceError(value, missingKeys);
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
      };

      const isMemberProvided = (field: TAgentVaultMemberProvidedField) =>
        data.memberProvidedFields.includes(field);
      const isSecretMemberProvided = isMemberProvided(
        AgentVaultVariableReferenceField.CredentialValue
      );
      const isUsernameMemberProvided = isMemberProvided(
        AgentVaultVariableReferenceField.CredentialUsername
      );

      if (
        data.credentialType !== AgentVaultCredentialType.Passthrough &&
        data.credentialType !== AgentVaultCredentialType.OAuth &&
        data.credentialType !== AgentVaultCredentialType.SshKey &&
        !isSecretMemberProvided
      ) {
        addReferenceIssue(data.secret, ["secret"]);
      }
      if (data.credentialType === AgentVaultCredentialType.Basic && !isUsernameMemberProvided) {
        addReferenceIssue(data.username, ["username"]);
      }
      data.customHeaders.forEach((header, index) =>
        addReferenceIssue(header.value, ["customHeaders", index, "value"])
      );
      data.substitutions.forEach((substitution, index) =>
        addReferenceIssue(substitution.value, ["substitutions", index, "value"])
      );

      if (
        data.credentialType === AgentVaultCredentialType.Passthrough ||
        data.credentialType === AgentVaultCredentialType.OAuth
      ) {
        return;
      }

      const isUnchanged = data.secret === UNCHANGED_SECRET;

      const typeChanged = Boolean(service) && service?.credential.type !== data.credentialType;
      // Nothing is stored to keep on create or after a type change, so every part has to be entered.
      const needsNewValue = !service || typeChanged;

      if (data.credentialType === AgentVaultCredentialType.SshKey) {
        const username = data.username ?? "";
        if (username !== UNCHANGED_SECRET) {
          if (!username.trim()) {
            if (needsNewValue) issue("username", "Enter the user to log in as.");
          } else {
            const usernameIssue = sshUsernameError(username);
            if (usernameIssue) issue("username", usernameIssue);
          }
        }
        if (data.sshPrivateKey !== UNCHANGED_SECRET) {
          if (!data.sshPrivateKey.trim()) {
            if (needsNewValue) issue("sshPrivateKey", "Paste the private key.");
          } else {
            const keyIssue = sshKeyTextError(data.sshPrivateKey);
            if (keyIssue) issue("sshPrivateKey", keyIssue);
          }
        }
        if (data.sshCertificate !== UNCHANGED_SECRET && !data.sshCertificateRemoved) {
          const certificateIssue = sshKeyTextError(data.sshCertificate);
          if (certificateIssue) issue("sshCertificate", certificateIssue);
        }
        return;
      }
      // A field each member used to set has nothing stored for the admin to keep.
      const wasMemberProvided = (field: TAgentVaultMemberProvidedField) =>
        !typeChanged && storedMemberFields(service).includes(field);

      if (data.credentialType === AgentVaultCredentialType.Bearer) {
        if (isSecretMemberProvided) return;
        if (
          (!service ||
            typeChanged ||
            wasMemberProvided(AgentVaultVariableReferenceField.CredentialValue)) &&
          !data.secret
        ) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secret"], message: "Required" });
        }
        return;
      }

      // Every database and SSH login names its user, so a password alone isn't enough.
      if (isNativeServiceType(data.serviceType)) {
        if (isUsernameMemberProvided) return;
        const hasUsername =
          data.username === UNCHANGED_SECRET ? !typeChanged : Boolean(data.username);
        if (!hasUsername) {
          issue("username", "Enter the username to log in as, or leave it to each member.");
        }
        return;
      }

      // A member sends at least one half, so the credential is never empty.
      if (isSecretMemberProvided || isUsernameMemberProvided) return;

      const willHaveUsername = data.username === UNCHANGED_SECRET ? true : Boolean(data.username);
      const willHavePassword = isUnchanged ? true : Boolean(data.secret);
      if (
        typeChanged
          ? Boolean(data.username) || Boolean(data.secret)
          : willHaveUsername || willHavePassword
      ) {
        return;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["username"],
        message: "Enter a username, a password, or both."
      });
    });

export type TServiceForm = z.infer<ReturnType<typeof buildServiceSchema>>;
