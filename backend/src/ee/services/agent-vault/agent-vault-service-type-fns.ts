import RE2 from "re2";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { shake } from "@app/lib/fn";

import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "./agent-vault-credential-schemas";
import { AgentVaultCredentialType, AgentVaultMcpTransport, AgentVaultServiceType } from "./agent-vault-enums";
import { AGENT_VAULT_DEFAULT_PORT, parseHostPatterns } from "./agent-vault-host-pattern-fns";

export const AGENT_VAULT_MAX_SERVER_URL_LENGTH = 2048;

const SERVER_URL_EXAMPLE = "https://mcp.example.com/mcp";
const SERVER_URL_SCHEME_RE = new RE2(/^https:\/\//i);
const TRAILING_HOST_DOT_RE = new RE2(/\.$/);

const describeServerUrlProblem = (raw: string): string | null => {
  if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(raw)) return AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE;
  // URL replaces lone surrogates, but keeping the raw value would make jsonb reject the write.
  if (
    [...raw].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint >= 0xd800 && codePoint <= 0xdfff;
    })
  )
    return "The server URL contains invalid text. Copy the URL from the browser and try again.";
  if ([...raw].some((character) => !character.trim())) return "The server URL can't contain spaces.";
  // Checked on the raw text because the URL parser accepts "https:host" and backslashes as if they were "https://".
  if (!SERVER_URL_SCHEME_RE.test(raw)) {
    return `The server URL must start with https://, as in ${SERVER_URL_EXAMPLE}. Agent Vault only brokers MCP servers over HTTPS.`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `The server URL isn't a valid URL. Enter the full address, as in ${SERVER_URL_EXAMPLE}.`;
  }

  if (url.username || url.password) {
    return "The server URL can't contain a username or password. Put the secret in the service's credential instead.";
  }
  if (raw.includes("#")) return "The server URL can't contain a fragment (the part after #).";
  if (raw.includes("?")) {
    return "Server URLs can't include a query string, since it is stored and shown in plaintext. Put a token in the Bearer token or a custom header instead.";
  }

  const { patterns, errors } = parseHostPatterns(url.hostname, "server URL");
  if (errors.length || patterns.length !== 1) {
    return `The server URL's host "${url.hostname}" isn't a host name or IP address Agent Vault can match.`;
  }
  if (patterns[0].isWildcard) return "The server URL must name a specific host, not a wildcard.";

  return null;
};

export const agentVaultMcpServerUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter the MCP server's URL.")
  .max(
    AGENT_VAULT_MAX_SERVER_URL_LENGTH,
    `The server URL can be at most ${AGENT_VAULT_MAX_SERVER_URL_LENGTH} characters.`
  )
  .superRefine((raw, ctx) => {
    const problem = describeServerUrlProblem(raw);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

// Path and query are not part of the match: the SSE transport posts to a message endpoint the server only
// announces at runtime. A portless pattern means 443, so an explicit :443 is dropped to keep one spelling.
export const deriveMcpHostPattern = (serverUrl: string): string => {
  const url = new URL(serverUrl);
  const host = url.hostname.replace(TRAILING_HOST_DOT_RE, "").toLowerCase();
  return url.port && url.port !== AGENT_VAULT_DEFAULT_PORT ? `${host}:${url.port}` : host;
};

const AgentVaultHttpServiceConfigSchema = z.object({});

const AgentVaultMcpServiceConfigSchema = z.object({
  serverUrl: agentVaultMcpServerUrlSchema,
  transport: z.nativeEnum(AgentVaultMcpTransport)
});

type TAgentVaultMcpServiceConfig = z.infer<typeof AgentVaultMcpServiceConfigSchema>;

export type TAgentVaultServiceConfig =
  | TAgentVaultMcpServiceConfig
  | { [K in keyof TAgentVaultMcpServiceConfig]?: never };

// The server an OAuth token is pinned to: a token is only ever sent to the server URL it was refreshed for.
export const getServiceServerUrl = (config: unknown): string | null =>
  (config as TAgentVaultServiceConfig | null)?.serverUrl ?? null;

export type TAgentVaultServiceTypeDefinition = {
  type: AgentVaultServiceType;
  label: string;
  configSchema: z.ZodObject<z.ZodRawShape>;
  allowedCredentialTypes: AgentVaultCredentialType[];
  // Null when the caller enters the host pattern itself.
  deriveHostPattern: ((config: Record<string, unknown>) => string) | null;
  supportsRequestRules: boolean;
  supportsTransformations: { customHeaders: boolean; substitutions: boolean };
  // Appended to the refusal when a request sends a field this type does not take.
  unsupportedFieldHint: string;
};

export const AGENT_VAULT_SERVICE_TYPES: Record<AgentVaultServiceType, TAgentVaultServiceTypeDefinition> = {
  [AgentVaultServiceType.Http]: {
    type: AgentVaultServiceType.Http,
    label: "HTTP",
    configSchema: AgentVaultHttpServiceConfigSchema,
    allowedCredentialTypes: [
      AgentVaultCredentialType.Bearer,
      AgentVaultCredentialType.Basic,
      AgentVaultCredentialType.Passthrough
    ],
    deriveHostPattern: null,
    supportsRequestRules: true,
    supportsTransformations: { customHeaders: true, substitutions: true },
    unsupportedFieldHint: "A server URL and transport apply only to MCP services."
  },
  [AgentVaultServiceType.Mcp]: {
    type: AgentVaultServiceType.Mcp,
    label: "MCP",
    configSchema: AgentVaultMcpServiceConfigSchema,
    allowedCredentialTypes: [AgentVaultCredentialType.Bearer, AgentVaultCredentialType.OAuth],
    deriveHostPattern: (config) => deriveMcpHostPattern((config as TAgentVaultMcpServiceConfig).serverUrl),
    supportsRequestRules: false,
    supportsTransformations: { customHeaders: true, substitutions: false },
    unsupportedFieldHint:
      "Its host comes from 'serverUrl', and method, path and substitution rules apply only to HTTP services."
  }
};

export const getAgentVaultServiceType = (type: string): TAgentVaultServiceTypeDefinition => {
  const definition = AGENT_VAULT_SERVICE_TYPES[type as AgentVaultServiceType];
  if (!definition) throw new BadRequestError({ message: `Unknown service type '${type}'` });
  return definition;
};

const CONFIG_FIELDS = [
  ...new Set(
    Object.values(AGENT_VAULT_SERVICE_TYPES).flatMap((definition) => Object.keys(definition.configSchema.shape))
  )
];

// Every field a service request can carry whose acceptance depends on the type. Common fields (name, credential)
// are not listed: every type takes them.
export type TAgentVaultServiceTypedFields = {
  hostPattern?: unknown;
  allowedMethods?: unknown;
  allowedPathPrefixes?: unknown;
  customHeaders?: unknown;
  substitutions?: unknown;
} & Record<string, unknown>;

export const findUnsupportedServiceFields = (
  definition: TAgentVaultServiceTypeDefinition,
  fields: TAgentVaultServiceTypedFields
): string[] => {
  const supported: Record<string, boolean> = {
    hostPattern: definition.deriveHostPattern === null,
    allowedMethods: definition.supportsRequestRules,
    allowedPathPrefixes: definition.supportsRequestRules,
    customHeaders: definition.supportsTransformations.customHeaders,
    substitutions: definition.supportsTransformations.substitutions,
    ...Object.fromEntries(CONFIG_FIELDS.map((field) => [field, field in definition.configSchema.shape]))
  };
  return Object.keys(supported).filter((field) => !supported[field] && fields[field] !== undefined);
};

// GET returns the fields a type doesn't use as null or empty, and an MCP service's host pattern derived from its
// server URL. Sending those back unchanged is not an attempt to set them, so they are dropped before the
// unsupported-field check refuses anything else.
export const dropReadBackServiceFields = <T extends TAgentVaultServiceTypedFields>(
  definition: TAgentVaultServiceTypeDefinition,
  fields: T,
  storedHostPattern: string
): T => {
  const isReadBack = (field: string) => {
    const value = fields[field];
    return (
      value === null ||
      (Array.isArray(value) && value.length === 0) ||
      (field === "hostPattern" && value === storedHostPattern)
    );
  };
  const dropped = findUnsupportedServiceFields(definition, fields).filter(isReadBack);
  return { ...fields, ...Object.fromEntries(dropped.map((field) => [field, undefined])) };
};

const quoteList = (fields: string[]) => {
  const quoted = fields.map((field) => `'${field}'`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} or ${quoted[quoted.length - 1]}` : quoted[0];
};

export const assertServiceFieldsSupported = (
  definition: TAgentVaultServiceTypeDefinition,
  fields: TAgentVaultServiceTypedFields
) => {
  const unsupported = findUnsupportedServiceFields(definition, fields);
  if (!unsupported.length) return;
  throw new BadRequestError({
    message: `An ${definition.label} service doesn't take ${quoteList(unsupported)}. ${definition.unsupportedFieldHint}`
  });
};

const CREDENTIAL_LABELS: Record<AgentVaultCredentialType, string> = {
  [AgentVaultCredentialType.Bearer]: "a bearer token",
  [AgentVaultCredentialType.Basic]: "basic auth",
  [AgentVaultCredentialType.Passthrough]: "pass-through",
  [AgentVaultCredentialType.OAuth]: "OAuth"
};

export const assertCredentialTypeSupported = (
  definition: TAgentVaultServiceTypeDefinition,
  credentialType: AgentVaultCredentialType
) => {
  if (definition.allowedCredentialTypes.includes(credentialType)) return;
  const allowed = definition.allowedCredentialTypes.map((type) => CREDENTIAL_LABELS[type]);
  throw new BadRequestError({
    message: `An ${definition.label} service can't use ${CREDENTIAL_LABELS[credentialType]} as its credential. Use ${allowed.join(" or ")}.`
  });
};

// `incoming` holds only the config fields the request sent; on an update the rest come from what is stored.
export const buildServiceConfig = (
  definition: TAgentVaultServiceTypeDefinition,
  incoming: Record<string, unknown>,
  stored: unknown = {}
): TAgentVaultServiceConfig => {
  const sent = shake(incoming, (value) => value === undefined);
  const parsed = definition.configSchema.safeParse({ ...((stored ?? {}) as Record<string, unknown>), ...sent });
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const field = issue.path.join(".");
    throw new BadRequestError({ message: field ? `'${field}': ${issue.message}` : issue.message });
  }
  return parsed.data as TAgentVaultServiceConfig;
};

export const resolveServiceHostPattern = (
  definition: TAgentVaultServiceTypeDefinition,
  config: TAgentVaultServiceConfig,
  hostPattern: string | undefined
): string => {
  if (definition.deriveHostPattern) return definition.deriveHostPattern(config);
  if (!hostPattern) throw new BadRequestError({ message: `An ${definition.label} service needs a host pattern.` });
  return hostPattern;
};
