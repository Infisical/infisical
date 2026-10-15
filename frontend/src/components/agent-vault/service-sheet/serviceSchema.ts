import { z } from "zod";

import { addHostIssues, hostError } from "@app/helpers/agentVaultHostPattern";
import { addPathPrefixIssues, pathPrefixError } from "@app/helpers/agentVaultPathPrefix";
import { variableReferenceError } from "@app/helpers/agentVaultVariables";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultOAuthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultOAuthCredentialSummary,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

/**
 * Seeded into a secret field on edit so the box can show that something is stored without the server
 * returning it. Never sent: the sheet maps it back to an omitted key.
 */
export const UNCHANGED_SECRET = "__INFISICAL_UNCHANGED__";

/** The API stores :443 explicitly, so it is stripped wherever a host pattern is shown and put back on save. */
export const displayHostPattern = (hostPattern: string) =>
  hostPattern
    .split(",")
    .map((host) => host.trim().replace(/:443$/, ""))
    .join(", ");

export const CREDENTIAL_LABELS: Record<AgentVaultCredentialType, string> = {
  [AgentVaultCredentialType.Bearer]: "Bearer",
  [AgentVaultCredentialType.Basic]: "Basic Auth",
  [AgentVaultCredentialType.Passthrough]: "Pass-through",
  [AgentVaultCredentialType.OAuth]: "OAuth 2.1"
};

export const HTTP_CREDENTIAL_TYPES = [
  AgentVaultCredentialType.Bearer,
  AgentVaultCredentialType.Basic,
  AgentVaultCredentialType.Passthrough
];

export const OAUTH_STATUS_LABELS: Record<AgentVaultOAuthStatus, string> = {
  [AgentVaultOAuthStatus.Connected]: "Connected",
  [AgentVaultOAuthStatus.NeedsReauthorization]: "Needs Reauthorization",
  [AgentVaultOAuthStatus.NeedsAdditionalScopes]: "Needs Additional Scopes"
};

export const SERVICE_TYPE_LABELS: Record<AgentVaultServiceType, string> = {
  [AgentVaultServiceType.Http]: "HTTP API",
  [AgentVaultServiceType.Mcp]: "MCP Server"
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
  return null;
};

export const SURFACE_LABELS: Record<AgentVaultSubstitutionSurface, string> = {
  [AgentVaultSubstitutionSurface.Path]: "URL Path",
  [AgentVaultSubstitutionSurface.Query]: "Query String",
  [AgentVaultSubstitutionSurface.Header]: "Headers",
  [AgentVaultSubstitutionSurface.Body]: "Body"
};

// Mirrors AGENT_VAULT_NO_CONTROL_CHARS_RE on the backend. A pasted key with a trailing newline is the
// common case, and it saves fine but then makes Go refuse to send the header.
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

const CONTROL_CHARS_MESSAGE =
  "This can't contain line breaks or other control characters. Check for a stray newline if you pasted it.";

// Double braces wrap a variable reference, and neither a prefix nor a placeholder takes one.
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
  Review = "review"
}

export const SERVICE_STEP_FIELDS: Record<ServiceStep, string[]> = {
  [ServiceStep.Template]: [],
  [ServiceStep.Details]: ["name", "hosts", "hostDraft", "methods", "pathPrefixes", "pathDraft"],
  [ServiceStep.Credential]: [
    "credentialType",
    "headerName",
    "headerPrefix",
    "username",
    "secret",
    "customHeaders",
    "substitutions"
  ],
  [ServiceStep.Review]: []
};

export const MCP_SERVICE_STEP_FIELDS: Record<ServiceStep, string[]> = {
  [ServiceStep.Template]: [],
  [ServiceStep.Details]: ["name", "serverUrl", "transport"],
  [ServiceStep.Credential]: [
    "credentialType",
    "headerName",
    "headerPrefix",
    "secret",
    "oauthAuthorizationId",
    "oauthClientId",
    "oauthClientSecret",
    "customHeaders"
  ],
  [ServiceStep.Review]: []
};

// Spelled out rather than picked from TServiceForm, which is inferred from the schema that calls these.
type TOAuthFormState = {
  serverUrl: string;
  oauthAuthorizationId: string;
  oauthAuthorizedUrl: string;
};

// Reusing an authorization after the server URL changes could attach its tokens to another host.
export const newOAuthAuthorizationId = (form: TOAuthFormState) =>
  form.oauthAuthorizationId && form.oauthAuthorizedUrl === form.serverUrl.trim()
    ? form.oauthAuthorizationId
    : undefined;

export const storedOAuthCredential = (
  service: TAgentVaultService | null | undefined,
  serverUrl: string
): TAgentVaultOAuthCredentialSummary | null =>
  service?.type === AgentVaultServiceType.Mcp &&
  service.credential.type === AgentVaultCredentialType.OAuth &&
  service.config.serverUrl === serverUrl.trim()
    ? service.credential
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
    form.credentialType !== AgentVaultCredentialType.OAuth
  ) {
    return false;
  }
  return !newOAuthAuthorizationId(form) && !storedOAuthCredential(service, form.serverUrl);
};

export const oauthStatusLabel = (form: TOAuthFormState, service?: TAgentVaultService | null) => {
  const stored = storedOAuthCredential(service, form.serverUrl);
  if (newOAuthAuthorizationId(form)) return stored ? "Reauthorized" : "Authorized";
  return stored ? OAUTH_STATUS_LABELS[stored.status] : "Not authorized";
};

/** `variableKeys` stays undefined while the list loads, so only the shape of a reference is checked. */
export const buildServiceSchema = (service?: TAgentVaultService | null, variableKeys?: string[]) =>
  z
    .object({
      serviceType: z.nativeEnum(AgentVaultServiceType),
      name: slugSchema({ max: 64, field: "Name" }),
      serverUrl: z.string(),
      transport: z.nativeEnum(AgentVaultMcpTransport),
      hosts: z.array(z.string()),
      // In the form rather than component state so the resolver sees it: trigger() wipes anything set with
      // setError, so a refusal held outside the form would let the step advance.
      hostDraft: z.string(),
      pathDraft: z.string(),
      credentialType: z.nativeEnum(AgentVaultCredentialType),
      headerName: z
        .string()
        .trim()
        .max(128)
        .regex(
          /^[A-Za-z0-9!#$%&'*+.^_`|~-]*$/,
          "A header name can't contain spaces or colons. Use letters, digits and dashes, as in X-API-Key."
        )
        .optional(),
      headerPrefix: z.string().trim().max(64).optional(),
      username: z.string().trim().max(256).optional(),
      secret: z.string().max(8192).optional(),
      oauthAuthorizationId: z.string(),
      // The server URL the authorization was made for, so editing the URL afterwards asks for a new one.
      oauthAuthorizedUrl: z.string(),
      oauthScopes: z.array(z.string()),
      oauthClientId: z
        .string()
        .trim()
        .max(512, "A client ID can be at most 512 characters.")
        .optional(),
      oauthClientSecret: z
        .string()
        .max(1024, "A client secret can be at most 1024 characters.")
        .optional(),
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
            message: "An MCP server takes OAuth 2.1 or a bearer token."
          });
        }
        if (isOAuthAuthorizationMissing(data, service)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["oauthAuthorizationId"],
            message: "Authorize the server to continue."
          });
        }
      }

      if (!isMcp) addHostIssues(data.hosts, ctx, ["hosts"]);
      const hostDraft = isMcp ? "" : data.hostDraft.trim();
      if (hostDraft) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hosts"],
          message: hostError(hostDraft, data.hosts) ?? `Add "${hostDraft}" or clear it.`
        });
      } else if (!isMcp && data.hosts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hosts"],
          message: "Add at least one host."
        });
      }

      const pathDraft = isMcp ? "" : data.pathDraft.trim();
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

      if (!isMcp && data.methods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["methods"],
          message: "Select at least one method."
        });
      }

      if (!isMcp) addPathPrefixIssues(data.pathPrefixes, ctx, ["pathPrefixes"]);

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
        else if (!NO_CONTROL_CHARS_RE.test(header.value)) at("value", CONTROL_CHARS_MESSAGE);

        if (header.prefix && !NO_CONTROL_CHARS_RE.test(header.prefix)) {
          at("prefix", CONTROL_CHARS_MESSAGE);
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
        } else if (!NO_CONTROL_CHARS_RE.test(substitution.placeholder)) {
          at("placeholder", CONTROL_CHARS_MESSAGE);
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
        else if (!NO_CONTROL_CHARS_RE.test(substitution.value)) at("value", CONTROL_CHARS_MESSAGE);
        if (substitution.surfaces.length === 0) {
          at("surfaces", "Pick at least one place to look for the placeholder.");
        }
      });

      const variableKeySet = variableKeys ? new Set(variableKeys) : undefined;
      const addReferenceIssue = (value: string | undefined, path: (string | number)[]) => {
        if (!value || value === UNCHANGED_SECRET) return;
        const message = variableReferenceError(value, variableKeySet);
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
      };

      if (
        data.credentialType !== AgentVaultCredentialType.Passthrough &&
        data.credentialType !== AgentVaultCredentialType.OAuth
      ) {
        addReferenceIssue(data.secret, ["secret"]);
      }
      if (data.credentialType === AgentVaultCredentialType.Basic) {
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

      if (data.credentialType === AgentVaultCredentialType.Bearer) {
        if ((!service || typeChanged) && !data.secret) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secret"], message: "Required" });
        }
        return;
      }

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
