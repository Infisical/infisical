import { z } from "zod";

import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { assertCustomHeadersDoNotShadowCredential } from "../agent-vault-access-bundle/agent-vault-transformation-fns";
import {
  assertHookNarrowingFitsService,
  serviceHookView,
  TAgentVaultServiceHookInput
} from "../agent-vault-hook/agent-vault-hook-fns";
import {
  isVariableOauth,
  oauthVariableIdOf,
  toResolvedOauthCredential
} from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import {
  AgentVaultOauthClientAuthMethod,
  TAgentVaultOauthConfig,
  TAgentVaultOauthVariableCredentialConfig
} from "../agent-vault-oauth/agent-vault-oauth-types";
import { TResolvedService } from "../agent-vault-proxy/agent-vault-proxy-types";
import { TSessionServiceCredential, TSessionServiceFacts } from "../agent-vault-proxy/agent-vault-session-services-fns";
import {
  toImportedOauthVariableConnection,
  toOauthVariableSettings
} from "../agent-vault-variable/agent-vault-oauth-variable-fns";
import { TAgentVaultOauthVariableConnection } from "../agent-vault-variable/agent-vault-variable-types";
import { findHostPatternConflicts, TConflictCandidate } from "../agent-vault/agent-vault-conflict-fns";
import { AgentVaultBearerConfigSchema } from "../agent-vault/agent-vault-credential-schemas";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultServiceType,
  AgentVaultVariableType
} from "../agent-vault/agent-vault-enums";
import {
  isNativeServiceType,
  toNativeTlsConfigInput,
  toResolvedNativeTarget
} from "../agent-vault/agent-vault-native-config-schemas";
import {
  assertCredentialTypeSupported,
  assertServiceFieldsSupported,
  buildServiceConfig,
  describeServiceType,
  getAgentVaultServiceType,
  getServiceServerUrl,
  getServiceTransport,
  isCredentialOfType,
  resolveServiceHostPattern,
  TAgentVaultServiceConfig,
  toServiceTypeFields
} from "../agent-vault/agent-vault-service-type-fns";
import {
  TAgentVaultInlineServiceRow,
  TAgentVaultInlineServiceSecretsRow
} from "./agent-vault-session-inline-service-dal";
import {
  TAgentVaultInlineCredentialSummary,
  TAgentVaultInlineCustomHeaderSummary,
  TAgentVaultInlineOauthCredentialSummary,
  TAgentVaultInlineServiceInput,
  TAgentVaultInlineServiceSummary,
  TAgentVaultInlineSubstitutionSummary
} from "./agent-vault-session-types";

export const AGENT_VAULT_MAX_SESSION_INLINE_SERVICES = 20;

// An OAuth credential is stored as an OAuth variable's id (no sealed value), or as the connection of the tokens sent
// with the session, whose tokens are sealed like any other credential.
type TInlineCredentialConfig =
  | Exclude<TAgentVaultInlineCredentialSummary, { type: AgentVaultCredentialType.OAuth }>
  | TAgentVaultOauthVariableCredentialConfig
  | TAgentVaultOauthVariableConnection;
type TInlineCustomHeader = TAgentVaultInlineCustomHeaderSummary;
type TInlineSubstitution = TAgentVaultInlineSubstitutionSummary;

// Values are kept in the order of the names and placeholders stored beside them.
const InlineServiceSecretsSchema = z.object({
  credential: z
    .union([
      z.object({ value: z.string() }),
      z.object({ username: z.string(), password: z.string() }),
      // Strict, so a basic secret is never read as an SSH key or the other way round.
      z.object({ username: z.string(), privateKey: z.string(), certificate: z.string().optional() }).strict(),
      z
        .object({ accessToken: z.string(), refreshToken: z.string().optional(), clientSecret: z.string().optional() })
        .strict()
    ])
    .nullable(),
  customHeaders: z.string().array(),
  substitutions: z.string().array()
});

export type TInlineServiceSecrets = z.infer<typeof InlineServiceSecretsSchema>;

export type TPreparedInlineService = {
  position: number;
  name: string | null;
  description: string | null;
  type: AgentVaultServiceType;
  config: TAgentVaultServiceConfig;
  hostPattern: string | null;
  allowedMethods: AgentVaultHttpMethod[] | null;
  allowedPathPrefixes: string[] | null;
  allowedTools: string[] | null;
  credentialConfig: TInlineCredentialConfig;
  customHeaders: TInlineCustomHeader[];
  substitutions: TInlineSubstitution[];
  // Null when there is nothing to seal: a pass-through service, or one using an OAuth variable, with no custom headers
  // or substitutions.
  secrets: TInlineServiceSecrets | null;
  // The OAuth variable a credential names, by key until bindInlineOauthVariables puts its id in credentialConfig.
  oauthVariableKey: string | null;
  // The project's saved hook it uses, by name until mint finds it in its transaction.
  hook: TAgentVaultServiceHookInput | null;
};

// What an inline service is called wherever a name is shown: its own, or its first host when it was sent without one,
// lowercased and without the default port, since hosts match regardless of case and every screen shows a host that way.
// A database or SSH service always has a name, since it is reached by it.
export const inlineServiceDisplayName = ({
  name,
  hostPattern
}: {
  name?: string | null;
  hostPattern?: string | null;
}) => name || (hostPattern ?? "").split(",")[0].trim().toLowerCase().replace(/:443$/, "");

/**
 * A session's own service wins over a bundle service of the same name: the bundle's is left out of that session, so
 * the agent, the proxy and its logs each see one service per name. Admins can add or rename bundle services freely
 * while sessions are live, and only the sessions that sent a service by that name keep their own.
 *
 * An override is the exception, and wins over a session's own service of its name instead: it only ever narrows what a
 * listed service allows on its hosts, so a service sent with the session must never switch it off by taking its name.
 */
export const withoutShadowedServices = <
  T extends { name: string; isOverride?: boolean },
  I extends { name?: string | null; hostPattern?: string | null }
>(
  bundleServices: T[],
  inlineServices: I[]
) => {
  if (!inlineServices.length) return { bundleServices, inlineServices };
  const overrideNames = new Set(bundleServices.filter((service) => service.isOverride).map(({ name }) => name));
  const keptInline = inlineServices.filter((service) => !overrideNames.has(inlineServiceDisplayName(service)));
  const inlineNames = new Set(keptInline.map(inlineServiceDisplayName));
  return {
    bundleServices: bundleServices.filter((service) => service.isOverride || !inlineNames.has(service.name)),
    inlineServices: keptInline
  };
};

type TInlineOauthInput = Extract<TAgentVaultInlineServiceInput["credential"], { type: AgentVaultCredentialType.OAuth }>;

// Everything an OAuth credential takes besides `variable`, which it takes instead.
const INLINE_OAUTH_TOKEN_FIELDS = [
  "accessToken",
  "refreshToken",
  "expiresAt",
  "authorizationEndpoint",
  "tokenEndpoint",
  "issuer",
  "clientId",
  "clientSecret",
  "tokenEndpointAuthMethod",
  "scopes",
  "resource"
] as const satisfies readonly (keyof TInlineOauthInput)[];

const INLINE_OAUTH_NEEDS_SOURCE_MESSAGE =
  "An OAuth credential sent with a session needs 'variable' with the key of a global OAuth variable, or 'accessToken' with the provider's 'authorizationEndpoint', 'tokenEndpoint', 'clientId' and 'scopes'.";

/**
 * An OAuth variable is stored by id once the session service has looked its key up. Tokens are checked like an OAuth
 * variable's import, with the same defaults, and stored as sent: refreshing them here would rotate the caller's own
 * copy.
 */
const toInlineOauthCredential = (
  credential: TInlineOauthInput,
  now: Date
): { config: TInlineCredentialConfig; secret: TInlineServiceSecrets["credential"]; variableKey: string | null } => {
  if (credential.authorizationId) {
    throw new BadRequestError({
      message: `Services sent with a session can't use an OAuth sign-in, which happens in the Infisical UI. ${INLINE_OAUTH_NEEDS_SOURCE_MESSAGE}`
    });
  }
  const sentTokenField = INLINE_OAUTH_TOKEN_FIELDS.find((field) => credential[field] !== undefined);
  if (credential.variable) {
    if (sentTokenField) {
      throw new BadRequestError({
        message: `Send either 'variable' or the tokens and the provider's details, not both. Leave out '${sentTokenField}'.`
      });
    }
    return {
      config: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: "" },
      secret: null,
      variableKey: credential.variable
    };
  }
  if (!credential.accessToken) throw new BadRequestError({ message: INLINE_OAUTH_NEEDS_SOURCE_MESSAGE });

  const settings = toOauthVariableSettings({
    authorizationEndpoint: credential.authorizationEndpoint,
    tokenEndpoint: credential.tokenEndpoint,
    issuer: credential.issuer,
    clientId: credential.clientId,
    tokenEndpointAuthMethod: credential.tokenEndpointAuthMethod,
    scopes: credential.scopes,
    resource: credential.resource
  });
  const missing = (["authorizationEndpoint", "tokenEndpoint", "clientId"] as const).find((field) => !settings[field]);
  if (missing) {
    throw new BadRequestError({
      message: `Tokens sent with a session need the provider's '${missing}', so Infisical can refresh them. Send 'authorizationEndpoint', 'tokenEndpoint', 'clientId' and 'scopes' with 'accessToken'.`
    });
  }
  if (!settings.scopes.length) {
    throw new BadRequestError({ message: "Tokens sent with a session need the scopes they were granted in 'scopes'." });
  }
  const method = settings.tokenEndpointAuthMethod;
  if (method && method !== AgentVaultOauthClientAuthMethod.None && !credential.clientSecret) {
    throw new BadRequestError({
      message: `'tokenEndpointAuthMethod' is '${method}', which needs your OAuth app's client secret. Send 'clientSecret' with the tokens.`
    });
  }
  if (method === AgentVaultOauthClientAuthMethod.None && credential.clientSecret) {
    throw new BadRequestError({
      message:
        "'tokenEndpointAuthMethod' is 'none', so your OAuth app has no client secret. Leave 'clientSecret' out, or change the method."
    });
  }
  const { connection, secret } = toImportedOauthVariableConnection(
    settings,
    {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      expiresAt: credential.expiresAt,
      clientSecret: credential.clientSecret
    },
    now
  );
  return { config: connection, secret, variableKey: null };
};

const toInlineCredential = (
  credential: Exclude<TAgentVaultInlineServiceInput["credential"], { type: AgentVaultCredentialType.OAuth }>
): { config: TInlineCredentialConfig; secret: TInlineServiceSecrets["credential"] } => {
  switch (credential.type) {
    case AgentVaultCredentialType.Bearer: {
      const { headerName, headerPrefix } = AgentVaultBearerConfigSchema.parse({
        headerName: credential.headerName,
        headerPrefix: credential.headerPrefix
      });
      return {
        config: { type: AgentVaultCredentialType.Bearer, headerName, headerPrefix },
        secret: { value: credential.value }
      };
    }
    case AgentVaultCredentialType.Basic:
      if (!credential.username && !credential.password) {
        throw new BadRequestError({ message: "A basic credential needs a username, a password, or both" });
      }
      return {
        config: { type: AgentVaultCredentialType.Basic },
        secret: { username: credential.username ?? "", password: credential.password ?? "" }
      };
    case AgentVaultCredentialType.SshKey:
      return {
        config: { type: AgentVaultCredentialType.SshKey, hasCertificate: Boolean(credential.certificate) },
        secret: {
          username: credential.username,
          privateKey: credential.privateKey,
          ...(credential.certificate ? { certificate: credential.certificate } : {})
        }
      };
    case AgentVaultCredentialType.Passthrough:
      return { config: { type: AgentVaultCredentialType.Passthrough }, secret: null };
    default: {
      const unknown: never = credential;
      throw new BadRequestError({ message: `Unknown credential type '${(unknown as { type: string }).type}'` });
    }
  }
};

const prepareInlineService = (input: TAgentVaultInlineServiceInput, position: number): TPreparedInlineService => {
  const definition = getAgentVaultServiceType(input.type);
  assertServiceFieldsSupported(definition, {
    hostPattern: input.hostPattern,
    allowedMethods: input.allowedMethods,
    allowedPathPrefixes: input.allowedPathPrefixes,
    customHeaders: input.customHeaders,
    substitutions: input.substitutions,
    serverUrl: input.serverUrl,
    transport: input.transport,
    host: input.host,
    port: input.port,
    database: input.database,
    tls: input.tls,
    allowedTools: input.allowedTools
  });

  const { credential } = input;
  if ("memberProvidedFields" in credential && credential.memberProvidedFields?.length) {
    throw new BadRequestError({
      message:
        "Services sent with a session can't leave a field to members, so send every value and leave out memberProvidedFields."
    });
  }
  assertCredentialTypeSupported(definition, credential.type);

  const config = buildServiceConfig(definition, {
    serverUrl: input.serverUrl,
    transport: input.transport,
    host: input.host,
    port: input.port,
    database: input.database,
    tls: toNativeTlsConfigInput(input.tls)
  });
  const hostPattern = resolveServiceHostPattern(definition, config, input.hostPattern);

  const {
    config: credentialConfig,
    secret,
    variableKey
  } = credential.type === AgentVaultCredentialType.OAuth
    ? toInlineOauthCredential(credential, new Date())
    : { ...toInlineCredential(credential), variableKey: null };
  if (
    isNativeServiceType(definition.type) &&
    credentialConfig.type === AgentVaultCredentialType.Basic &&
    !(secret && "username" in secret && secret.username)
  ) {
    throw new BadRequestError({
      message: `${describeServiceType(definition)} needs a username to log in as. Set one in the credential.`
    });
  }
  const customHeaders = input.customHeaders ?? [];
  const substitutions = input.substitutions ?? [];
  assertCustomHeadersDoNotShadowCredential(credentialConfig, customHeaders);
  if (input.hook) {
    assertHookNarrowingFitsService(input.hook, {
      name: inlineServiceDisplayName({ name: input.name, hostPattern }),
      type: definition.type
    });
  }

  return {
    position,
    name: input.name ?? null,
    description: input.description ?? null,
    type: definition.type,
    config,
    hostPattern,
    allowedMethods: input.allowedMethods ?? null,
    allowedPathPrefixes: input.allowedPathPrefixes ?? null,
    allowedTools: input.allowedTools ?? null,
    credentialConfig,
    customHeaders: customHeaders.map((header) => ({ name: header.name, prefix: header.prefix ?? "" })),
    substitutions: substitutions.map((substitution) => ({
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces
    })),
    oauthVariableKey: variableKey,
    hook: input.hook ?? null,
    secrets:
      secret || customHeaders.length || substitutions.length
        ? {
            credential: secret,
            customHeaders: customHeaders.map((header) => header.value),
            substitutions: substitutions.map((substitution) => substitution.value)
          }
        : null
  };
};

// How mint errors point at a service: by the name it was sent with, or by its place in the list.
const inlineServiceLabel = (service: Pick<TPreparedInlineService, "name" | "position">) =>
  service.name ? `'${service.name}'` : `at index ${service.position}`;

const toConflictCandidate = (service: TPreparedInlineService): TConflictCandidate => ({
  id: String(service.position),
  name: inlineServiceLabel(service),
  hostPattern: service.hostPattern
});

/**
 * Checks and normalizes the services a mint sends, the way a bundle service's create does, and holds them to the
 * same host rule as one bundle's services: an exact host may sit beside a wildcard that contains it, but two services
 * covering the same pattern would leave the proxy's choice to the order they were sent in.
 */
// `positions` places each service in the session's list of services, which an error also names it by. Its index among
// the inline services otherwise.
export const prepareInlineServices = (
  inputs: TAgentVaultInlineServiceInput[],
  positions?: number[]
): TPreparedInlineService[] => {
  const prepared = inputs.map((input, index) => {
    const position = positions?.[index] ?? index;
    try {
      return prepareInlineService(input, position);
    } catch (error) {
      if (error instanceof BadRequestError) {
        const label = `Service ${inlineServiceLabel({ name: input.name ?? null, position })}`;
        throw new BadRequestError({ message: `${label}: ${error.message}` });
      }
      throw error;
    }
  });

  prepared.forEach((service, index) => {
    const [conflict] = findHostPatternConflicts(service.hostPattern, prepared.slice(0, index).map(toConflictCandidate));
    if (conflict) {
      throw new BadRequestError({
        name: "ServiceHostConflict",
        message: `The service ${conflict.serviceName} and the service ${inlineServiceLabel(service)} both cover ${conflict.patterns.join(", ")}. Remove it from one of them.`
      });
    }
  });

  // An unnamed service goes by its first host in session logs and proxy errors, so it can't share that name.
  const byDisplayName = new Map<string, TPreparedInlineService>();
  prepared.forEach((service) => {
    const displayName = inlineServiceDisplayName(service);
    const earlier = byDisplayName.get(displayName);
    if (earlier) {
      throw new BadRequestError({
        message: `The service ${inlineServiceLabel(earlier)} and the service ${inlineServiceLabel(service)} would both be called '${displayName}', since a service sent without a name goes by its first host. Give one of them a different name.`
      });
    }
    byDisplayName.set(displayName, service);
  });

  return prepared;
};

/**
 * Puts the id of the global OAuth variable each OAuth credential names in its config. No reference row holds the
 * variable: deleting it while the session is live is allowed, and resolve then refuses the service.
 */
export const bindInlineOauthVariables = (
  prepared: TPreparedInlineService[],
  variables: { id: string; key: string; type: string }[]
): TPreparedInlineService[] => {
  const byKey = new Map(variables.map((variable) => [variable.key, variable]));
  return prepared.map((service) => {
    const key = service.oauthVariableKey;
    if (!key) return service;
    const label = `Service ${inlineServiceLabel(service)}`;
    const variable = byKey.get(key);
    if (!variable) {
      throw new BadRequestError({
        message: `${label}: There's no global variable named '${key}'. Add it under Variables as an OAuth variable, or correct the name.`
      });
    }
    if (variable.type !== AgentVaultVariableType.OAuth) {
      throw new BadRequestError({
        message: `${label}: '${key}' is a text variable, and an OAuth credential takes an OAuth variable.`
      });
    }
    return {
      ...service,
      credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: variable.id }
    };
  });
};

/**
 * A mint that also names an access bundle can't send a service covering a pattern one of the bundle's services covers,
 * or one called the same as a bundle's service. Only checked at mint: the bundle can change afterwards, and resolve puts
 * the bundle's services first, so a pattern a later bundle edit shares with an inline service goes to the bundle's. A
 * database or SSH service is found by name instead, and there the proxy prefers the inline one.
 */
export const assertNoAccessBundleConflicts = (
  prepared: TPreparedInlineService[],
  accessBundle: { name: string; services: TConflictCandidate[] }
) => {
  prepared.forEach((service) => {
    const label = inlineServiceLabel(service);
    const [conflict] = findHostPatternConflicts(service.hostPattern, accessBundle.services);
    if (conflict) {
      throw new BadRequestError({
        message: `The service ${label} covers ${conflict.patterns.join(", ")}, which '${conflict.serviceName}' in the access bundle '${accessBundle.name}' already covers. Remove it from the service ${label}.`
      });
    }
    const displayName = inlineServiceDisplayName(service);
    if (accessBundle.services.some((bundleService) => bundleService.name === displayName)) {
      throw new BadRequestError({
        message: service.name
          ? `The service ${label} has the same name as a service in the access bundle '${accessBundle.name}'. Give it a different name.`
          : `The service ${label} goes by its first host, '${displayName}', which is the name of a service in the access bundle '${accessBundle.name}'. Give it a name.`
      });
    }
  });
};

// A service sent inline can't cover a host a service the session lists covers, or go by that service's name.
// One with a name of its own was already checked against the names the session sends, so only a service that goes by
// its first host can match here.
export const assertNoServiceConflicts = (prepared: TPreparedInlineService[], listedServices: TConflictCandidate[]) => {
  prepared.forEach((service) => {
    const label = inlineServiceLabel(service);
    const [conflict] = findHostPatternConflicts(service.hostPattern, listedServices);
    if (conflict) {
      throw new BadRequestError({
        message: `The service ${label} covers ${conflict.patterns.join(", ")}, which '${conflict.serviceName}', a project service in this session, already covers. Remove it from the service ${label}, or leave '${conflict.serviceName}' out.`
      });
    }
    const displayName = inlineServiceDisplayName(service);
    if (listedServices.some((candidate) => candidate.name === displayName)) {
      throw new BadRequestError({
        message: `The service ${label} goes by its first host, '${displayName}', which is the name of a project service in this session. Give it a name.`
      });
    }
  });
};

// Resolve lets an override win over an inline service of its name, so a mint refuses the name rather than send a
// service the session would never carry.
export const assertNoOverrideConflicts = (prepared: TPreparedInlineService[], overrides: { name: string }[]) => {
  if (!overrides.length) return;
  const overrideNames = new Set(overrides.map(({ name }) => name));
  prepared.forEach((service) => {
    const displayName = inlineServiceDisplayName(service);
    if (overrideNames.has(displayName)) {
      throw new BadRequestError({
        message: service.name
          ? `The service ${inlineServiceLabel(service)} has the same name as '${displayName}', a service this session gets from an access bundle alongside one of its project services. Give it a different name.`
          : `The service ${inlineServiceLabel(service)} goes by its first host, '${displayName}', which is the name of a service this session gets from an access bundle alongside one of its project services. Give it a name.`
      });
    }
  });
};

export type TAgentVaultSessionInlineServiceSummaryRow = TAgentVaultInlineServiceRow;

export type TInlineOauthVariableKeys = ReadonlyMap<string, { id: string; key: string }>;

export const inlineOauthVariableIdsOf = (rows: { credentialType: string; credentialConfig?: unknown }[]) => [
  ...new Set(
    rows.flatMap((row) =>
      isVariableOauth(row) ? [(row.credentialConfig as TAgentVaultOauthVariableCredentialConfig).variableId] : []
    )
  )
];

const toInlineOauthCredentialSummary = (
  config: TAgentVaultOauthVariableCredentialConfig | TAgentVaultOauthVariableConnection,
  oauthVariables: TInlineOauthVariableKeys
): TAgentVaultInlineOauthCredentialSummary => {
  if ("source" in config && config.source === "variable") {
    const variable = oauthVariables.get(config.variableId);
    return {
      type: AgentVaultCredentialType.OAuth,
      source: "variable",
      ...(variable ? { variable: { id: variable.id, key: variable.key } } : {})
    };
  }
  const connection = config as TAgentVaultOauthVariableConnection;
  return {
    type: AgentVaultCredentialType.OAuth,
    source: "inline",
    issuer: connection.issuer,
    grantedScopes: connection.grantedScopes ?? []
  };
};

const toInlineCredentialSummary = (
  config: TInlineCredentialConfig,
  oauthVariables: TInlineOauthVariableKeys
): TAgentVaultInlineCredentialSummary => {
  switch (config.type) {
    case AgentVaultCredentialType.Bearer:
      return { type: config.type, headerName: config.headerName, headerPrefix: config.headerPrefix };
    case AgentVaultCredentialType.SshKey:
      return { type: config.type, hasCertificate: Boolean(config.hasCertificate) };
    case AgentVaultCredentialType.OAuth:
      return toInlineOauthCredentialSummary(config, oauthVariables);
    default:
      return { type: config.type };
  }
};

// Built by hand rather than spread, so the sealed column stays off the wire even if a response schema is loosened.
export const toInlineServiceSummary = (
  row: TAgentVaultSessionInlineServiceSummaryRow,
  oauthVariables: TInlineOauthVariableKeys = new Map(),
  hookNames?: ReadonlyMap<string, string>
): TAgentVaultInlineServiceSummary => {
  const base = {
    id: row.id,
    name: inlineServiceDisplayName(row),
    description: row.description ?? null,
    ...(hookNames && { hook: serviceHookView(row, hookNames) })
  };
  const credential = toInlineCredentialSummary(row.credentialConfig as TInlineCredentialConfig, oauthVariables);
  // Every mint checks the credential against the type, so this means a row written some other way.
  const unsupportedCredential = () =>
    new InternalServerError({
      message: `The session's service '${base.name}' has a credential its type doesn't support. Mint a new session.`
    });
  const typeFields = toServiceTypeFields(row);
  switch (typeFields.type) {
    case AgentVaultServiceType.Http:
      if (
        !isCredentialOfType(credential, [
          AgentVaultCredentialType.Bearer,
          AgentVaultCredentialType.Basic,
          AgentVaultCredentialType.Passthrough,
          AgentVaultCredentialType.OAuth
        ])
      ) {
        throw unsupportedCredential();
      }
      return {
        ...base,
        ...typeFields,
        credential,
        customHeaders: row.customHeaders as TInlineCustomHeader[],
        substitutions: row.substitutions as TInlineSubstitution[]
      };
    case AgentVaultServiceType.Mcp:
      if (!isCredentialOfType(credential, [AgentVaultCredentialType.Bearer, AgentVaultCredentialType.OAuth])) {
        throw unsupportedCredential();
      }
      return { ...base, ...typeFields, credential, customHeaders: row.customHeaders as TInlineCustomHeader[] };
    case AgentVaultServiceType.Ssh:
      if (!isCredentialOfType(credential, [AgentVaultCredentialType.Basic, AgentVaultCredentialType.SshKey])) {
        throw unsupportedCredential();
      }
      return { ...base, ...typeFields, credential };
    default:
      if (!isCredentialOfType(credential, [AgentVaultCredentialType.Basic])) throw unsupportedCredential();
      return { ...base, ...typeFields, credential };
  }
};

// A pass-through credential seals nothing, and an OAuth variable's tokens live on the variable.
const sealsCredential = (row: Pick<TAgentVaultInlineServiceRow, "credentialType" | "credentialConfig">) =>
  (row.credentialConfig as TInlineCredentialConfig).type !== AgentVaultCredentialType.Passthrough &&
  !isVariableOauth(row);

// Whether the service needs a sealed value to go out. One that does and has none had its session end.
const needsSecrets = (row: TAgentVaultInlineServiceRow) =>
  sealsCredential(row) || row.customHeaders.length > 0 || row.substitutions.length > 0;

/**
 * The service's sealed values, opened, in the order of the names and placeholders beside them. Null once its session
 * ended and they were deleted, or when one is missing, so resolve never sends a half-built service.
 */
export const openInlineServiceSecrets = (
  row: TAgentVaultInlineServiceSecretsRow,
  decryptJson: (encrypted: Buffer) => unknown
): TInlineServiceSecrets | null => {
  if (row.secretsDeletedAt || !needsSecrets(row)) return null;
  if (sealsCredential(row) && !row.encryptedCredential) return null;
  const values = [...row.customHeaders, ...row.substitutions].map((entry) => entry.encryptedValue);
  if (values.some((value) => !value)) return null;
  const valueOf = (encrypted: Buffer | null) => (decryptJson(encrypted!) as { value: string }).value;
  return InlineServiceSecretsSchema.parse({
    credential: row.encryptedCredential ? decryptJson(row.encryptedCredential) : null,
    customHeaders: row.customHeaders.map((header) => valueOf(header.encryptedValue)),
    substitutions: row.substitutions.map((substitution) => valueOf(substitution.encryptedValue))
  });
};

/**
 * Null when the service can't go out: it needs secrets and none are stored, which means its session ended and they
 * were deleted, or what is stored doesn't line up with the names beside it. Its values were sent as they are, so
 * nothing in them is expanded.
 */
/**
 * An inline service as the list an agent reads describes it, built without decrypting anything. Left out when resolve
 * would leave it out: a service whose credential, custom headers or substitutions have no stored secrets to send.
 */
export const toInlineServiceFacts = (
  row: TAgentVaultInlineServiceSecretsRow,
  isOauthVariableSignedIn: (variableId: string) => boolean
): TSessionServiceFacts | null => {
  const credentialConfig = row.credentialConfig as TInlineCredentialConfig;
  const { customHeaders, substitutions } = row;
  if (needsSecrets(row) && row.secretsDeletedAt) return null;
  const variableId = oauthVariableIdOf(row);
  const credentialNotConnected = Boolean(variableId && !isOauthVariableSignedIn(variableId));

  let credential: TSessionServiceCredential = { type: "none" };
  if (credentialConfig.type === AgentVaultCredentialType.Bearer) {
    credential = { type: "bearer", headerName: credentialConfig.headerName ?? null };
  } else if (credentialConfig.type === AgentVaultCredentialType.Basic) {
    credential = { type: "basic" };
  } else if (credentialConfig.type === AgentVaultCredentialType.OAuth && !credentialNotConnected) {
    credential = { type: "oauth" };
  }

  return {
    name: inlineServiceDisplayName(row),
    description: row.description ?? null,
    type: row.type as AgentVaultServiceType,
    hostPattern: row.hostPattern ?? null,
    serverUrl: getServiceServerUrl(row.config),
    transport: getServiceTransport(row.config),
    allowedMethods: row.allowedMethods ?? null,
    allowedPathPrefixes: row.allowedPathPrefixes ?? null,
    allowedTools: row.allowedTools ?? null,
    credential,
    customHeaderNames: customHeaders.map((header) => header.name),
    substitutions: substitutions.map(({ placeholder, surfaces }) => ({ placeholder, surfaces })),
    personalValuesMissing: credentialNotConnected,
    ...(credentialNotConnected ? { credentialNotConnected } : {}),
    memberProvided: false,
    memberSignsIn: false
  };
};

/**
 * What resolve worked out for an OAuth credential before building the service: the token it refreshed, or for an OAuth
 * variable, its token (none while it isn't connected) or that it was deleted.
 */
export type TInlineOauthResolution = {
  credential?: TResolvedService["credential"];
  removed?: boolean;
  notConnected?: boolean;
};

export const toResolvedInlineService = (
  row: TAgentVaultInlineServiceRow,
  secrets: TInlineServiceSecrets | null,
  oauth: TInlineOauthResolution = {}
): TResolvedService | null => {
  const credentialConfig = row.credentialConfig as TInlineCredentialConfig;
  const { customHeaders, substitutions } = row;

  let credential: TResolvedService["credential"];
  // The variable was deleted, or isn't connected, while the session was live. The service still goes out so the proxy
  // can say why it refuses it; personalValuesMissing makes a proxy that predates credentialRemoved and
  // credentialNotConnected refuse it too, rather than send it with no credential.
  let credentialRemoved = false;
  let credentialNotConnected = false;
  let variableCredentialMissing = false;
  if (credentialConfig.type === AgentVaultCredentialType.Passthrough) {
    credential = { type: AgentVaultCredentialType.Passthrough };
  } else if (isVariableOauth(row)) {
    credentialRemoved = Boolean(oauth.removed);
    credentialNotConnected = !credentialRemoved && Boolean(oauth.notConnected);
    variableCredentialMissing = credentialRemoved || !oauth.credential;
    credential = (!credentialRemoved && oauth.credential) || { type: AgentVaultCredentialType.Passthrough };
  } else if (
    credentialConfig.type === AgentVaultCredentialType.OAuth &&
    secrets?.credential &&
    "accessToken" in secrets.credential
  ) {
    credential =
      oauth.credential ??
      toResolvedOauthCredential(credentialConfig as TAgentVaultOauthConfig, secrets.credential.accessToken);
  } else if (
    credentialConfig.type === AgentVaultCredentialType.Bearer &&
    secrets?.credential &&
    "value" in secrets.credential
  ) {
    credential = {
      type: AgentVaultCredentialType.Bearer,
      headerName: credentialConfig.headerName,
      headerPrefix: credentialConfig.headerPrefix,
      value: secrets.credential.value
    };
  } else if (
    credentialConfig.type === AgentVaultCredentialType.Basic &&
    secrets?.credential &&
    "password" in secrets.credential
  ) {
    credential = {
      type: AgentVaultCredentialType.Basic,
      username: secrets.credential.username,
      password: secrets.credential.password
    };
  } else if (
    credentialConfig.type === AgentVaultCredentialType.SshKey &&
    secrets?.credential &&
    "privateKey" in secrets.credential
  ) {
    credential = {
      type: AgentVaultCredentialType.SshKey,
      username: secrets.credential.username,
      privateKey: secrets.credential.privateKey,
      ...(secrets.credential.certificate ? { certificate: secrets.credential.certificate } : {})
    };
  } else {
    return null;
  }

  if (
    (customHeaders.length || substitutions.length) &&
    (secrets?.customHeaders.length !== customHeaders.length || secrets.substitutions.length !== substitutions.length)
  ) {
    return null;
  }
  return {
    id: row.id,
    name: inlineServiceDisplayName(row),
    accessBundleName: null,
    accessBundleId: null,
    type: row.type as AgentVaultServiceType,
    hostPattern: row.hostPattern ?? null,
    native: toResolvedNativeTarget(row.type, row.config),
    allowedMethods: row.allowedMethods ?? null,
    allowedPathPrefixes: row.allowedPathPrefixes ?? null,
    allowedTools: row.allowedTools ?? null,
    credential,
    customHeaders: customHeaders.map((header, index) => ({ ...header, value: secrets!.customHeaders[index] })),
    substitutions: substitutions.map((substitution, index) => ({
      ...substitution,
      value: secrets!.substitutions[index]
    })),
    personalValuesMissing: variableCredentialMissing,
    ...(credentialRemoved ? { credentialRemoved } : {}),
    ...(credentialNotConnected ? { credentialNotConnected } : {}),
    memberProvided: false,
    hook: null
  };
};
