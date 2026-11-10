import { z } from "zod";

import { TAgentVaultSessionInlineServices } from "@app/db/schemas";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { assertCustomHeadersDoNotShadowCredential } from "../agent-vault-access-bundle/agent-vault-transformation-fns";
import { TResolvedService } from "../agent-vault-proxy/agent-vault-proxy-types";
import { TSessionServiceCredential, TSessionServiceFacts } from "../agent-vault-proxy/agent-vault-session-services-fns";
import { findHostPatternConflicts, TConflictCandidate } from "../agent-vault/agent-vault-conflict-fns";
import { AgentVaultBearerConfigSchema } from "../agent-vault/agent-vault-credential-schemas";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultServiceType
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
  TAgentVaultInlineCredentialSummary,
  TAgentVaultInlineCustomHeaderSummary,
  TAgentVaultInlineServiceInput,
  TAgentVaultInlineServiceSummary,
  TAgentVaultInlineSubstitutionSummary
} from "./agent-vault-session-types";

export const AGENT_VAULT_MAX_SESSION_INLINE_SERVICES = 20;

type TInlineCredentialConfig = TAgentVaultInlineCredentialSummary;
type TInlineCustomHeader = TAgentVaultInlineCustomHeaderSummary;
type TInlineSubstitution = TAgentVaultInlineSubstitutionSummary;

// Values are kept in the order of the names and placeholders stored beside them.
const InlineServiceSecretsSchema = z.object({
  credential: z
    .union([
      z.object({ value: z.string() }),
      z.object({ username: z.string(), password: z.string() }),
      // Strict, so a basic secret is never read as an SSH key or the other way round.
      z.object({ username: z.string(), privateKey: z.string(), certificate: z.string().optional() }).strict()
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
  credentialConfig: TInlineCredentialConfig;
  customHeaders: TInlineCustomHeader[];
  substitutions: TInlineSubstitution[];
  // Null when there is nothing to seal: a pass-through service with no custom headers or substitutions.
  secrets: TInlineServiceSecrets | null;
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
  if (input.allowedTools?.length) {
    throw new BadRequestError({
      message:
        "Services sent with a session can't limit an MCP server's tools, so leave out allowedTools. Add the MCP server to an access bundle to limit its tools."
    });
  }

  const { credential } = input;
  if (credential.type === AgentVaultCredentialType.OAuth) {
    throw new BadRequestError({
      message:
        "Services sent with a session can't use OAuth, since an OAuth service is connected by signing in from the Infisical UI. Add it to an access bundle instead."
    });
  }
  if ("memberProvidedFields" in credential && credential.memberProvidedFields?.length) {
    throw new BadRequestError({
      message:
        "Services sent with a session can't leave a field to members, so send every value and leave out memberProvidedFields."
    });
  }
  assertCredentialTypeSupported(
    definition,
    credential.type,
    definition.allowedCredentialTypes.filter((type) => type !== AgentVaultCredentialType.OAuth)
  );

  const config = buildServiceConfig(definition, {
    serverUrl: input.serverUrl,
    transport: input.transport,
    host: input.host,
    port: input.port,
    database: input.database,
    tls: toNativeTlsConfigInput(input.tls)
  });
  const hostPattern = resolveServiceHostPattern(definition, config, input.hostPattern);

  const { config: credentialConfig, secret } = toInlineCredential(credential);
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

  return {
    position,
    name: input.name ?? null,
    description: input.description ?? null,
    type: definition.type,
    config,
    hostPattern,
    allowedMethods: input.allowedMethods ?? null,
    allowedPathPrefixes: input.allowedPathPrefixes ?? null,
    credentialConfig,
    customHeaders: customHeaders.map((header) => ({ name: header.name, prefix: header.prefix ?? "" })),
    substitutions: substitutions.map((substitution) => ({
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces
    })),
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
export const prepareInlineServices = (inputs: TAgentVaultInlineServiceInput[]): TPreparedInlineService[] => {
  const prepared = inputs.map((input, position) => {
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

export type TAgentVaultSessionInlineServiceSummaryRow = Omit<TAgentVaultSessionInlineServices, "encryptedSecrets">;

const toInlineCredentialSummary = (config: TInlineCredentialConfig): TInlineCredentialConfig => {
  switch (config.type) {
    case AgentVaultCredentialType.Bearer:
      return { type: config.type, headerName: config.headerName, headerPrefix: config.headerPrefix };
    case AgentVaultCredentialType.SshKey:
      return { type: config.type, hasCertificate: Boolean(config.hasCertificate) };
    default:
      return { type: config.type };
  }
};

// Built by hand rather than spread, so the sealed column stays off the wire even if a response schema is loosened.
export const toInlineServiceSummary = (
  row: TAgentVaultSessionInlineServiceSummaryRow
): TAgentVaultInlineServiceSummary => {
  const base = { id: row.id, name: inlineServiceDisplayName(row), description: row.description ?? null };
  const credential = toInlineCredentialSummary(row.credentialConfig as TInlineCredentialConfig);
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
          AgentVaultCredentialType.Passthrough
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
      if (!isCredentialOfType(credential, [AgentVaultCredentialType.Bearer])) throw unsupportedCredential();
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

export const parseInlineServiceSecrets = (decrypted: unknown) => InlineServiceSecretsSchema.parse(decrypted);

/**
 * Null when the service can't go out: it needs secrets and none are stored, which means its session ended and they
 * were deleted, or what is stored doesn't line up with the names beside it. Its values were sent as they are, so
 * nothing in them is expanded.
 */
/**
 * An inline service as the list an agent reads describes it, built without decrypting anything. Left out when resolve
 * would leave it out: a service whose credential, custom headers or substitutions have no stored secrets to send.
 */
export const toInlineServiceFacts = (row: TAgentVaultSessionInlineServices): TSessionServiceFacts | null => {
  const credentialConfig = row.credentialConfig as TInlineCredentialConfig;
  const customHeaders = row.customHeaders as TInlineCustomHeader[];
  const substitutions = row.substitutions as TInlineSubstitution[];
  const needsSecrets =
    credentialConfig.type !== AgentVaultCredentialType.Passthrough ||
    customHeaders.length > 0 ||
    substitutions.length > 0;
  if (needsSecrets && !row.encryptedSecrets) return null;

  let credential: TSessionServiceCredential = { type: "none" };
  if (credentialConfig.type === AgentVaultCredentialType.Bearer) {
    credential = { type: "bearer", headerName: credentialConfig.headerName ?? null };
  } else if (credentialConfig.type === AgentVaultCredentialType.Basic) {
    credential = { type: "basic" };
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
    // An inline MCP server can't be limited to some of its tools, so the proxy filters none.
    allowedTools: null,
    credential,
    customHeaderNames: customHeaders.map((header) => header.name),
    substitutions: substitutions.map(({ placeholder, surfaces }) => ({ placeholder, surfaces })),
    personalValuesMissing: false,
    memberProvided: false,
    memberSignsIn: false
  };
};

export const toResolvedInlineService = (
  row: TAgentVaultSessionInlineServices,
  secrets: TInlineServiceSecrets | null
): TResolvedService | null => {
  const credentialConfig = row.credentialConfig as TInlineCredentialConfig;
  const customHeaders = row.customHeaders as TInlineCustomHeader[];
  const substitutions = row.substitutions as TInlineSubstitution[];

  let credential: TResolvedService["credential"];
  if (credentialConfig.type === AgentVaultCredentialType.Passthrough) {
    credential = { type: AgentVaultCredentialType.Passthrough };
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
    type: row.type as AgentVaultServiceType,
    hostPattern: row.hostPattern ?? null,
    native: toResolvedNativeTarget(row.type, row.config),
    allowedMethods: row.allowedMethods ?? null,
    allowedPathPrefixes: row.allowedPathPrefixes ?? null,
    // An inline MCP server can't be limited to some of its tools, so the proxy filters none.
    allowedTools: null,
    credential,
    customHeaders: customHeaders.map((header, index) => ({ ...header, value: secrets!.customHeaders[index] })),
    substitutions: substitutions.map((substitution, index) => ({
      ...substitution,
      value: secrets!.substitutions[index]
    })),
    personalValuesMissing: false,
    memberProvided: false
  };
};
