import { isMemberOauthConnectionUsable, isMemberProvidedOauth } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultTrafficPolicy
} from "../agent-vault/agent-vault-enums";
import { isNativeServiceType } from "../agent-vault/agent-vault-native-config-schemas";
import {
  getAgentVaultServiceType,
  getServiceServerUrl,
  getServiceTransport
} from "../agent-vault/agent-vault-service-type-fns";
import { TResolveServiceRow } from "./agent-vault-resolve-dal";

// The list an agent reads to learn what its session can use. It is shown to the agent word for word, so the wording is
// part of how well agents use Agent Vault: change it only with the built-in skill in mind, and measure the change.

export type TSessionServiceCredential =
  | { type: "bearer"; headerName: string | null }
  | { type: "oauth" }
  | { type: "basic" }
  | { type: "none" };

// Everything the list says about one service. Built without decrypting anything, so it can never carry a credential, a
// custom header's value, or a substitution's value.
export type TSessionServiceFacts = {
  name: string;
  description: string | null;
  type: AgentVaultServiceType;
  // Null for a database or SSH service, which the agent reaches through `infisical agent-vault connect`.
  hostPattern: string | null;
  serverUrl: string | null;
  transport: string | null;
  allowedMethods: string[] | null;
  allowedPathPrefixes: string[] | null;
  allowedTools: string[] | null;
  credential: TSessionServiceCredential;
  customHeaderNames: string[];
  substitutions: { placeholder: string; surfaces: string[] }[];
  personalValuesMissing: boolean;
  // Some part of the credential is the session owner's own, so a rejection is theirs to fix, not an admin's.
  memberProvided: boolean;
  // Each member signs in to the service with OAuth, so what they're missing is a connected account.
  memberSignsIn: boolean;
};

export type TSessionServiceDescription = {
  name: string;
  description: string | null;
  type: AgentVaultServiceType;
  hosts: string[];
  url: string | null;
  transport?: string;
  status: "ready" | "needs-personal-values";
  credential: {
    type: "bearer" | "oauth" | "basic" | "login" | "none";
    header?: string;
    addedByProxy: boolean;
    memberProvided: boolean;
  };
  customHeaders: string[];
  placeholders: { placeholder: string; surfaces: string[] }[];
  allowedMethods: string[] | null;
  allowedPathPrefixes: string[] | null;
  allowedTools: string[] | null;
  howToUse: string;
};

export type TSessionServicesProxy = {
  name: string;
  version: string | null;
  trafficPolicy: string;
  // The hosts an admin lets through under service-hosts though no service covers them, as written.
  allowedHosts: string | null;
};

export type TSessionServicesDocument = {
  agentVault: { proxy: string | null; version: string | null; trafficPolicy: "any-host" | "service-hosts" | null };
  session: { expiresAt: string | null; accessBundle: string | null };
  services: TSessionServiceDescription[];
  notes: string[];
};

const DEFAULT_PORT = "443";
const OAUTH_HEADER = "Authorization";
const SURFACE_ORDER: string[] = [
  AgentVaultSubstitutionSurface.Path,
  AgentVaultSubstitutionSurface.Query,
  AgentVaultSubstitutionSurface.Header,
  AgentVaultSubstitutionSurface.Body
];

// As typed and in order, which is how admins wrote them and what an agent reads best.
const splitHostPatterns = (raw: string | null) =>
  (raw ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

// The proxy's own reading of a pattern, so the URL offered here is one the proxy matches: a bracketed IPv6 host keeps its
// port after the bracket, and otherwise the port follows the last colon.
const parseHostPattern = (pattern: string) => {
  if (pattern.startsWith("[")) {
    const end = pattern.indexOf("]");
    if (end !== -1) {
      const rest = pattern.slice(end + 1);
      return {
        host: pattern.slice(1, end),
        port: rest.startsWith(":") && rest.length > 1 ? rest.slice(1) : DEFAULT_PORT
      };
    }
  }
  let host = pattern;
  let port = DEFAULT_PORT;
  const colon = pattern.lastIndexOf(":");
  if (colon !== -1) {
    if (pattern.slice(colon + 1)) port = pattern.slice(colon + 1);
    host = pattern.slice(0, colon);
  }
  return { host: host.endsWith(".") ? host.slice(0, -1) : host, port };
};

// A URL only for a service with exactly one host that isn't a wildcard. A pattern without a port is 443, so https.
const serviceBaseUrl = (hostPattern: string | null) => {
  const patterns = splitHostPatterns(hostPattern);
  if (patterns.length !== 1) return null;
  const { host, port } = parseHostPattern(patterns[0]);
  if (host.includes("*")) return null;
  const shown = host.includes(":") ? `[${host}]` : host;
  if (port === "443") return `https://${shown}`;
  if (port === "80") return `http://${shown}`;
  return `https://${shown}:${port}`;
};

const sortedUnique = (values: string[]) => [...new Set(values)].sort();

const describeCredential = (service: TSessionServiceFacts): TSessionServiceDescription["credential"] => {
  const { memberProvided } = service;
  if (service.personalValuesMissing) return { type: "none", addedByProxy: false, memberProvided };
  // A database or SSH service's credential is the account the proxy logs in as, not anything sent in a request.
  if (isNativeServiceType(service.type)) return { type: "login", addedByProxy: true, memberProvided };
  switch (service.credential.type) {
    case "bearer":
      return {
        type: "bearer",
        header: service.credential.headerName || "Authorization",
        addedByProxy: true,
        memberProvided
      };
    case "oauth":
      return { type: "oauth", header: OAUTH_HEADER, addedByProxy: true, memberProvided };
    case "basic":
      return { type: "basic", header: "Authorization", addedByProxy: true, memberProvided };
    default:
      return { type: "none", addedByProxy: false, memberProvided };
  }
};

// A session uses its owner's personal values, or, on a user's behalf, that user's.
const personalValuesHolder = (onBehalfOfUser: boolean) =>
  onBehalfOfUser ? "the user this session is for" : "the session's owner";

const memberCredentialSentence = (
  credentialType: TSessionServiceDescription["credential"]["type"],
  name: string,
  onBehalfOfUser: boolean
) => {
  if (credentialType === "login") {
    return onBehalfOfUser
      ? `The account is partly the personal value of the user this session is for. If the proxy can't log in, that user has to update their personal value for ${name} in Agent Vault, which an admin can't do for them.`
      : `The account is partly the session owner's own personal value. If the proxy can't log in, they have to update their personal value for ${name} in Agent Vault, which an admin can't do for them.`;
  }
  if (credentialType === "oauth") {
    return onBehalfOfUser
      ? `The credential is the sign-in of the user this session is for. If the server rejects it, that user has to reconnect their account for ${name} in Agent Vault, which an admin can't do for them.`
      : `The credential is the session owner's own sign-in. If the server rejects it, they have to reconnect their account for ${name} in Agent Vault, which an admin can't do for them.`;
  }
  return onBehalfOfUser
    ? `The credential is the personal value of the user this session is for. If the service rejects it with 401 or 403, that user has to update their personal value for ${name} in Agent Vault, which an admin can't do for them.`
    : `The credential is the session owner's own. If the service rejects it with 401 or 403, they have to update their personal value for ${name} in Agent Vault, which an admin can't do for them.`;
};

const howToUse = (
  service: TSessionServiceFacts,
  description: Omit<TSessionServiceDescription, "howToUse">,
  onBehalfOfUser: boolean
) => {
  if (service.personalValuesMissing) {
    // A sign-in that expired needs connecting again, not values set, so one sentence covers both.
    const setUp = service.memberSignsIn ? "connect their account" : "set their personal values";
    return `Not usable yet: ${personalValuesHolder(onBehalfOfUser)} has to ${setUp} for ${JSON.stringify(service.name)} in Agent Vault. The proxy refuses requests to it until then, and it can take a few minutes to apply.`;
  }
  const parts: string[] = [];
  const target = description.url ?? "these hosts";
  if (isNativeServiceType(service.type)) {
    const { label } = getAgentVaultServiceType(service.type);
    const kind = service.type === AgentVaultServiceType.Ssh ? `${label} server` : `${label} database`;
    parts.push(
      `${kind}, not reachable over HTTP. Run infisical agent-vault connect ${service.name} and leave it running: it prints a local address on 127.0.0.1 and an example command. Point your client at that address with any username and no password: the proxy logs in with the service's account.`
    );
  } else if (service.type === AgentVaultServiceType.Mcp) {
    const transport = description.transport ?? AgentVaultMcpTransport.StreamableHttp;
    const connect = `Remote MCP server (${transport} transport). Connect to ${target} with no credential and no OAuth sign-in: the proxy adds the credential. A client that only loads MCP servers at startup will not see a server added now, so in this session`;
    // An SSE server answers on the stream it opened, at a message URL it announces, not in the reply to a POST.
    parts.push(
      transport === AgentVaultMcpTransport.Sse
        ? `${connect} open a GET request to ${target} with Accept: text/event-stream and keep reading it. Its first event, named endpoint, gives the URL to POST JSON-RPC messages to, and every response arrives on that stream rather than in the reply to the POST (call initialize, send the notifications/initialized notification, then call tools/list and tools/call).`
        : `${connect} call it with JSON-RPC over HTTPS POST to ${target} (send Content-Type: application/json and Accept: application/json, text/event-stream; call initialize, send the notifications/initialized notification, then call tools/list and tools/call; on every request after initialize, send back any Mcp-Session-Id header it returns and an MCP-Protocol-Version header with the protocolVersion from its initialize result).`
    );
  } else if (description.credential.type === "bearer" || description.credential.type === "oauth") {
    parts.push(
      `Call ${target} directly. The proxy sets the ${description.credential.header} header, so send no key, or any placeholder value if a client or SDK insists on one. A key you send in that header is replaced.`
    );
  } else if (description.credential.type === "basic") {
    parts.push(
      `Call ${target} directly. The proxy sets HTTP Basic auth, so send no credentials, or any placeholder username and password.`
    );
  } else if (service.substitutions.length === 0) {
    parts.push(`Call ${target} directly. The proxy adds no credential to requests for this service.`);
  } else {
    parts.push(`Call ${target} directly.`);
  }
  if (description.credential.addedByProxy && description.credential.memberProvided) {
    parts.push(memberCredentialSentence(description.credential.type, JSON.stringify(service.name), onBehalfOfUser));
  }
  description.placeholders.forEach(({ placeholder, surfaces }) =>
    parts.push(
      `Write ${JSON.stringify(placeholder)} exactly where the secret goes (in the ${surfaces.join(" or ")}): the proxy replaces it with the real value. Any other value is sent unchanged.`
    )
  );
  if (description.customHeaders.length) parts.push(`The proxy also sets ${description.customHeaders.join(", ")}.`);
  if (description.allowedMethods) {
    parts.push(
      `Only ${description.allowedMethods.join(", ")} requests are allowed; the proxy refuses any other method.`
    );
  }
  if (description.allowedPathPrefixes) {
    parts.push(`Only paths starting with ${description.allowedPathPrefixes.join(", ")} are allowed.`);
  }
  if (description.allowedTools) parts.push(`Only these tools can be called: ${description.allowedTools.join(", ")}.`);
  return parts.join(" ");
};

export const describeSessionService = (
  service: TSessionServiceFacts,
  onBehalfOfUser = false
): TSessionServiceDescription => {
  const isMcp = service.type === AgentVaultServiceType.Mcp;
  let type = isMcp ? AgentVaultServiceType.Mcp : AgentVaultServiceType.Http;
  if (isNativeServiceType(service.type)) type = service.type;
  const description: Omit<TSessionServiceDescription, "howToUse"> = {
    name: service.name,
    description: service.description || null,
    type,
    hosts: splitHostPatterns(service.hostPattern),
    url: isMcp ? service.serverUrl || null : serviceBaseUrl(service.hostPattern),
    ...(isMcp && service.transport ? { transport: service.transport } : {}),
    status: service.personalValuesMissing ? "needs-personal-values" : "ready",
    credential: describeCredential(service),
    customHeaders: [...service.customHeaderNames],
    // Longest first, the order the proxy swaps them in, so a placeholder that starts with another one comes first.
    placeholders: [...service.substitutions]
      .sort((a, b) => b.placeholder.length - a.placeholder.length)
      .map(({ placeholder, surfaces }) => ({
        placeholder,
        surfaces: SURFACE_ORDER.filter((surface) => surfaces.includes(surface))
      })),
    allowedMethods: service.allowedMethods
      ? sortedUnique(service.allowedMethods.map((method) => method.trim().toUpperCase()))
      : null,
    allowedPathPrefixes: service.allowedPathPrefixes,
    allowedTools: service.allowedTools ? sortedUnique(service.allowedTools) : null
  };
  return { ...description, howToUse: howToUse(service, description, onBehalfOfUser) };
};

// Enough to name every host an agent usually needs, such as a package registry, without filling the list.
const MAX_LISTED_EXCEPTIONS = 25;

const exceptionsNote = (allowedHosts: string | null) => {
  const exceptions = allowedHosts ? splitHostPatterns(allowedHosts) : [];
  if (!exceptions.length) return "This proxy refuses requests to hosts no service covers.";
  const shown = exceptions.slice(0, MAX_LISTED_EXCEPTIONS).join(", ");
  const more =
    exceptions.length > MAX_LISTED_EXCEPTIONS ? ` and ${exceptions.length - MAX_LISTED_EXCEPTIONS} more` : "";
  return `This proxy refuses requests to hosts no service covers, except these, which an admin allowed: ${shown}${more}. The proxy adds no credential to requests to them.`;
};

const sessionNotes = (
  trafficPolicy: TSessionServicesDocument["agentVault"]["trafficPolicy"],
  allowedHosts: string | null,
  expiresAt: string | null,
  onBehalfOfUser: boolean,
  hasNativeServices: boolean
) => {
  const notes = [
    "Requests to these services go through this proxy, which adds each service's credential on the way out. You never hold the real keys, so a missing key in your environment is expected.",
    "Use your usual HTTP client with the proxy settings from the environment (HTTPS_PROXY). Do not unset them or bypass the proxy: a request that skips it carries no credential.",
    `Responses that went through the proxy carry X-Agent-Vault-Decision: brokered (a credential was added), passthrough (no service covers the host), blocked (the proxy refused it; the JSON body says why) or error. A 401 or 403 marked brokered means the stored credential was rejected or lacks permission: an Agent Vault admin has to fix it, or ${personalValuesHolder(onBehalfOfUser)} when the service's credential is memberProvided, and a key you send will not help.`
  ];
  if (trafficPolicy === "service-hosts") notes.push(exceptionsNote(allowedHosts));
  if (trafficPolicy === "any-host") {
    notes.push("Hosts no service covers are reachable, but the proxy adds nothing to those requests.");
  }
  notes.push(
    hasNativeServices
      ? "Not supported through the proxy: WebSockets, HTTP/2-only clients such as gRPC, and connections that are not HTTP, except the database and SSH services listed here, which you reach through infisical agent-vault connect."
      : "Not supported through the proxy: WebSockets, HTTP/2-only clients such as gRPC, and connections that are not HTTP."
  );
  if (expiresAt) notes.push(`The session expires at ${expiresAt}; after that the proxy refuses every request.`);
  return notes;
};

// Whole seconds, as the proxy wrote it before Infisical did, so the agent reads the same text either way.
const toRfc3339 = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Builds the list of a session's services for an agent. The proxy is the one the request came through, when it named
 * itself and belongs to the session's project, and is null otherwise: a call made straight to Infisical gets the
 * services without any proxy's traffic policy.
 */
export const buildSessionServicesDocument = ({
  proxy,
  session,
  services
}: {
  proxy: TSessionServicesProxy | null;
  session: { expiresAt: Date | null; accessBundle: string | null; onBehalfOfUser: boolean };
  services: TSessionServiceFacts[];
}): TSessionServicesDocument => {
  let trafficPolicy: TSessionServicesDocument["agentVault"]["trafficPolicy"] = null;
  if (proxy) trafficPolicy = proxy.trafficPolicy === AgentVaultTrafficPolicy.AnyHost ? "any-host" : "service-hosts";
  const expiresAt = session.expiresAt ? toRfc3339(session.expiresAt) : null;
  return {
    agentVault: { proxy: proxy?.name ?? null, version: proxy?.version ?? null, trafficPolicy },
    session: { expiresAt, accessBundle: session.accessBundle },
    services: services.map((service) => describeSessionService(service, session.onBehalfOfUser)),
    notes: sessionNotes(
      trafficPolicy,
      proxy?.allowedHosts ?? null,
      expiresAt,
      session.onBehalfOfUser,
      services.some((service) => isNativeServiceType(service.type))
    )
  };
};

/**
 * The fields set in the personal values the session uses, by service, counted only where resolve would use them: a member's OAuth
 * sign-in on a service that leaves sign-in to members, while resolve would send it, and a typed value anywhere else.
 */
export const toSetPersonalFields = (
  rows: Pick<TResolveServiceRow, "id" | "config" | "credentialType" | "memberProvidedFields">[],
  personalValueRows: { serviceId: string; field: string; oauthConfig?: unknown }[]
) => {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const setFields = new Map<string, Set<string>>();
  personalValueRows.forEach(({ serviceId, field, oauthConfig }) => {
    const row = rowById.get(serviceId);
    if (!row) return;
    const counts = isMemberProvidedOauth(row) ? isMemberOauthConnectionUsable(row, oauthConfig) : !oauthConfig;
    if (counts) setFields.set(serviceId, (setFields.get(serviceId) ?? new Set<string>()).add(field));
  });
  return setFields;
};

/**
 * What the proxy would send for a bundle service, without decrypting anything. A field left to members makes the
 * credential the member's, which only counts once they have set every such field.
 */
export const toBundleServiceFacts = (
  row: TResolveServiceRow,
  context: {
    customHeaderNames: string[];
    substitutions: { placeholder: string; surfaces: string[] }[];
    setPersonalFields: Set<string>;
  }
): TSessionServiceFacts => {
  const memberFields = row.memberProvidedFields ?? [];
  const personalValuesMissing = memberFields.some((field) => !context.setPersonalFields.has(field));
  const config = (row.credentialConfig ?? {}) as Record<string, string | undefined>;
  const hasCredential = Boolean(row.encryptedCredential) || memberFields.length > 0;

  let credential: TSessionServiceCredential = { type: "none" };
  if (!personalValuesMissing && hasCredential) {
    if (row.credentialType === AgentVaultCredentialType.Bearer) {
      credential = { type: "bearer", headerName: config.headerName ?? null };
    } else if (
      row.credentialType === AgentVaultCredentialType.OAuth &&
      (row.encryptedCredential || isMemberProvidedOauth(row))
    ) {
      // A service whose members sign in seals at most its client's secret, so the token is the member's.
      credential = { type: "oauth" };
    } else if (row.credentialType === AgentVaultCredentialType.Basic) {
      credential = { type: "basic" };
    }
  }

  return {
    name: row.name,
    description: row.description,
    type: row.type as AgentVaultServiceType,
    hostPattern: row.hostPattern,
    serverUrl: getServiceServerUrl(row.config),
    transport: getServiceTransport(row.config),
    allowedMethods: row.allowedMethods,
    allowedPathPrefixes: row.allowedPathPrefixes,
    allowedTools: row.allowedTools,
    credential,
    customHeaderNames: context.customHeaderNames,
    substitutions: context.substitutions,
    personalValuesMissing,
    memberProvided: memberFields.length > 0,
    memberSignsIn: isMemberProvidedOauth(row)
  };
};
