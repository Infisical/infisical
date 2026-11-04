import { AxiosError, isAxiosError } from "axios";
import sodium from "libsodium-wrappers";
import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import {
  getGitHubAppAuthToken,
  getGitHubGatewayConnectionDetails,
  getGitHubInstanceApiUrl,
  GitHubConnectionMethod,
  makePaginatedGitHubRequest,
  requestWithGitHubGateway,
  TGitHubAppCredentialResolverDeps,
  TGitHubConnection
} from "@app/services/app-connection/github";
import {
  GitHubSyncScope,
  GitHubSyncSecretType,
  GitHubSyncVisibility
} from "@app/services/secret-sync/github/github-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TPreSaveTransformDestinationConfigFn } from "@app/services/secret-sync/secret-sync-types";

import { TGitHubPublicKey, TGitHubSecret, TGitHubSecretPayload, TGitHubSyncWithCredentials } from "./github-sync-types";

type TGitHubSyncDestinationConfig = TGitHubSyncWithCredentials["destinationConfig"];

type TGitHubSyncDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type TGitHubSecretTypeDefinition = {
  name: string;
  pathSegment: string;
  permission: { organization: string; repository: string };
  limit: { organization: number; repository: number };
};

const GITHUB_SECRET_TYPES: Record<GitHubSyncSecretType, TGitHubSecretTypeDefinition> = {
  [GitHubSyncSecretType.Actions]: {
    name: "Actions",
    pathSegment: "actions",
    permission: { organization: "Secrets", repository: "Secrets" },
    limit: { organization: 1000, repository: 100 }
  },
  // GitHub publishes no Dependabot-specific limits, so these mirror the Actions limits
  [GitHubSyncSecretType.Dependabot]: {
    name: "Dependabot",
    pathSegment: "dependabot",
    permission: { organization: "Organization dependabot secrets", repository: "Dependabot secrets" },
    limit: { organization: 1000, repository: 100 }
  },
  [GitHubSyncSecretType.Codespaces]: {
    name: "Codespaces",
    pathSegment: "codespaces",
    permission: { organization: "Organization codespaces secrets", repository: "Codespaces secrets" },
    limit: { organization: 100, repository: 100 }
  }
};

const CODESPACES_ON_GITHUB_SERVER_MESSAGE =
  "Codespaces secrets are not available on GitHub Enterprise Server. Choose the Actions or Dependabot secret type, or use a GitHub.com connection.";

const GITHUB_SECRET_NAME_PATTERN = new RE2(/^[A-Za-z_][A-Za-z0-9_]*$/);
const GITHUB_RESERVED_PREFIX = new RE2(/^GITHUB_/i);

const GITHUB_SECRET_NAME_RULE =
  "GitHub does not accept secret names unless they contain only letters, digits, and underscores, and start with a letter or an underscore. Spaces are not allowed. Names cannot start with GITHUB_, regardless of case.";

const isGitHubSecretName = (name: string) =>
  GITHUB_SECRET_NAME_PATTERN.test(name) && !GITHUB_RESERVED_PREFIX.test(name);

const assertGitHubSecretNames = (names: string[]) => {
  const invalidNames = names.filter((name) => !isGitHubSecretName(name));
  if (!invalidNames.length) return;

  throw new SecretSyncError({
    secretKey: invalidNames[0],
    shouldRetry: false,
    message: `${GITHUB_SECRET_NAME_RULE} Rename the secrets that failed this check: ${invalidNames
      .map((name) => `"${name}"`)
      .join(", ")}.`
  });
};

// actions is the default for legacy syncs
export const getGitHubSyncSecretType = (destinationConfig: { secretType?: GitHubSyncSecretType }) =>
  destinationConfig.secretType ?? GitHubSyncSecretType.Actions;

const isGitHubServerConnection = (credentials: { instanceType?: string | null }) =>
  credentials.instanceType === "server";

export const getGitHubSecretsBasePath = (destinationConfig: TGitHubSyncDestinationConfig) => {
  const secretType = getGitHubSyncSecretType(destinationConfig);
  const { name, pathSegment } = GITHUB_SECRET_TYPES[secretType];

  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization:
      return `/orgs/${encodeURIComponent(destinationConfig.org)}/${pathSegment}/secrets`;
    case GitHubSyncScope.Repository:
      return `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/${pathSegment}/secrets`;
    case GitHubSyncScope.RepositoryEnvironment:
      if (secretType !== GitHubSyncSecretType.Actions) {
        throw new SecretSyncError({
          message: `GitHub ${name} secrets cannot be synced to a repository environment. Use the Repository or Organization scope instead.`,
          shouldRetry: false
        });
      }
      return `/repos/${encodeURIComponent(destinationConfig.owner)}/${encodeURIComponent(destinationConfig.repo)}/environments/${encodeURIComponent(destinationConfig.env)}/secrets`;
    default:
      throw new SecretSyncError({
        message: `Unsupported GitHub Sync scope ${(destinationConfig as TGitHubSyncDestinationConfig).scope}`,
        shouldRetry: false
      });
  }
};

const describeGitHubSecretsTarget = (destinationConfig: TGitHubSyncDestinationConfig) => {
  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization:
      return {
        target: `organization '${destinationConfig.org}'`,
        missing: "the organization exists"
      };
    case GitHubSyncScope.RepositoryEnvironment:
      return {
        target: `environment '${destinationConfig.env}' in repository '${destinationConfig.owner}/${destinationConfig.repo}'`,
        missing: "the repository and environment exist"
      };
    case GitHubSyncScope.Repository:
    default:
      return {
        target: `repository '${destinationConfig.owner}/${destinationConfig.repo}'`,
        missing: "the repository exists"
      };
  }
};

const isGitHubRateLimitError = (error: AxiosError) => {
  const headers = error.response?.headers;
  if (headers?.["x-ratelimit-remaining"] === "0" || headers?.["retry-after"]) return true;

  const message = (error.response?.data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" && message.toLowerCase().includes("rate limit");
};

const GITHUB_REFUSED_MESSAGE = "GitHub refused this request.";

const gitHubResponseMessage = (error: AxiosError) => {
  const message = (error.response?.data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" && message.trim() ? message.trim() : GITHUB_REFUSED_MESSAGE;
};

const gitHubSyncAccountLogin = (destinationConfig: TGitHubSyncDestinationConfig) =>
  destinationConfig.scope === GitHubSyncScope.Organization ? destinationConfig.org : destinationConfig.owner;

const requiredGitHubSecretPermission = (destinationConfig: TGitHubSyncDestinationConfig) => {
  const { permission } = GITHUB_SECRET_TYPES[getGitHubSyncSecretType(destinationConfig)];
  if (destinationConfig.scope === GitHubSyncScope.RepositoryEnvironment) {
    return `the '${permission.repository}' and 'Environments' permissions`;
  }

  const permissionName =
    destinationConfig.scope === GitHubSyncScope.Organization ? permission.organization : permission.repository;
  return `the '${permissionName}' permission`;
};

const joinSentences = (lead: string, rest: string) => (/[.!?]$/.test(lead) ? `${lead} ${rest}` : `${lead}. ${rest}`);

const gitHubAppInstallationLinks = (host: string | undefined, installationId: string, accountLogin: string) => {
  const webHost = host || "github.com";
  const encodedInstallationId = encodeURIComponent(installationId);
  const personalUrl = `https://${webHost}/settings/installations/${encodedInstallationId}`;
  const organizationUrl = `https://${webHost}/organizations/${encodeURIComponent(accountLogin)}/settings/installations/${encodedInstallationId}`;
  return `${personalUrl} (personal) or ${organizationUrl} (organization)`;
};

export const toGitHubSecretsError = (
  error: unknown,
  { destinationConfig, connection }: Pick<TGitHubSyncWithCredentials, "destinationConfig" | "connection">
) => {
  if (!isAxiosError(error) || !error.response) return error;

  const { status } = error.response;
  if (status !== 403 && status !== 404) return error;
  if (status === 403 && isGitHubRateLimitError(error)) return error;

  if (status === 404) {
    const { name } = GITHUB_SECRET_TYPES[getGitHubSyncSecretType(destinationConfig)];
    const { target, missing } = describeGitHubSecretsTarget(destinationConfig);
    return new SecretSyncError({
      error,
      shouldRetry: false,
      message: `GitHub could not find the ${name} secrets for ${target}. Check that ${missing} and that the GitHub connection has the permissions to access it.`
    });
  }

  const requiredPermission = `Grant read and write access to ${requiredGitHubSecretPermission(destinationConfig)}.`;
  let message = joinSentences(gitHubResponseMessage(error), requiredPermission);
  if (connection.method === GitHubConnectionMethod.App) {
    const { host, installationId } = connection.credentials;
    message = `${message} GitHub App installation: ${gitHubAppInstallationLinks(
      host,
      installationId,
      gitHubSyncAccountLogin(destinationConfig)
    )}`;
  }

  return new SecretSyncError({ error, message, shouldRetry: false });
};

const requestGitHubSecretsApi = async <T>(
  secretSync: TGitHubSyncWithCredentials,
  { gatewayV2Service, gatewayPoolService }: TGitHubSyncDeps,
  token: string,
  { method, path = "", data }: { method: "GET" | "PUT" | "DELETE"; path?: string; data?: Record<string, unknown> }
) => {
  const { connection, destinationConfig } = secretSync;

  const apiBaseUrl = await getGitHubInstanceApiUrl(connection);
  const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId
  });
  const gatewayConnectionDetails = effectiveGatewayId
    ? await getGitHubGatewayConnectionDetails(effectiveGatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;

  try {
    const response = await requestWithGitHubGateway<T>(
      { gatewayId: effectiveGatewayId },
      gatewayV2Service,
      {
        url: `https://${apiBaseUrl}${getGitHubSecretsBasePath(destinationConfig)}${path}`,
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        },
        ...(data && { data })
      },
      gatewayConnectionDetails
    );

    return response.data;
  } catch (error) {
    throw toGitHubSecretsError(error, secretSync);
  }
};

const getEncryptedSecrets = async (
  secretSync: TGitHubSyncWithCredentials,
  { gatewayV2Service, gatewayPoolService }: TGitHubSyncDeps,
  gitHubAppDeps: TGitHubAppCredentialResolverDeps
) => {
  const { destinationConfig, connection } = secretSync;

  try {
    return await makePaginatedGitHubRequest<TGitHubSecret, { secrets: TGitHubSecret[] }>(
      connection,
      gatewayV2Service,
      gatewayPoolService,
      getGitHubSecretsBasePath(destinationConfig),
      gitHubAppDeps,
      (data) => data.secrets
    );
  } catch (error) {
    throw toGitHubSecretsError(error, secretSync);
  }
};

const getPublicKey = (secretSync: TGitHubSyncWithCredentials, deps: TGitHubSyncDeps, token: string) =>
  requestGitHubSecretsApi<TGitHubPublicKey>(secretSync, deps, token, {
    method: "GET",
    path: "/public-key"
  });

const deleteSecret = async (
  secretSync: TGitHubSyncWithCredentials,
  deps: TGitHubSyncDeps,
  token: string,
  encryptedSecret: TGitHubSecret
) => {
  try {
    await requestGitHubSecretsApi(secretSync, deps, token, {
      method: "DELETE",
      path: `/${encodeURIComponent(encryptedSecret.name)}`
    });
  } catch (error) {
    // The secret was removed on GitHub after it was listed, which is the state this delete wanted
    if (error instanceof SecretSyncError && isAxiosError(error.error) && error.error.response?.status === 404) return;
    throw error;
  }
};

const putSecret = (
  secretSync: TGitHubSyncWithCredentials,
  deps: TGitHubSyncDeps,
  token: string,
  payload: TGitHubSecretPayload
) => {
  const { destinationConfig } = secretSync;

  let body: Record<string, string | number[] | undefined> = payload;

  if (destinationConfig.scope === GitHubSyncScope.Organization) {
    const { visibility, selectedRepositoryIds } = destinationConfig;
    body = {
      ...payload,
      visibility,
      ...(visibility === GitHubSyncVisibility.Selected && {
        selected_repository_ids: selectedRepositoryIds
      })
    };
  }

  return requestGitHubSecretsApi(secretSync, deps, token, {
    method: "PUT",
    path: `/${encodeURIComponent(payload.secret_name)}`,
    data: body
  });
};

const resolveGitHubSyncConnection = async (
  secretSync: TGitHubSyncWithCredentials,
  { gatewayV2Service, gatewayPoolService }: TGitHubSyncDeps,
  gitHubAppDeps: TGitHubAppCredentialResolverDeps
) => {
  const { connection: rawConnection } = secretSync;

  if (
    getGitHubSyncSecretType(secretSync.destinationConfig) === GitHubSyncSecretType.Codespaces &&
    isGitHubServerConnection(rawConnection.credentials)
  ) {
    throw new SecretSyncError({ message: CODESPACES_ON_GITHUB_SERVER_MESSAGE, shouldRetry: false });
  }

  const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
    gatewayId: rawConnection.gatewayId,
    gatewayPoolId: rawConnection.gatewayPoolId
  });
  const connection = { ...rawConnection, gatewayId: effectiveGatewayId, gatewayPoolId: null };
  let token: string;

  switch (connection.method) {
    case GitHubConnectionMethod.OAuth:
      token = connection.credentials.accessToken;
      break;
    case GitHubConnectionMethod.Pat:
      token = connection.credentials.personalAccessToken;
      break;
    default:
      token = await getGitHubAppAuthToken(connection, gatewayV2Service, gatewayPoolService, gitHubAppDeps);
  }

  return { resolvedSync: { ...secretSync, connection }, token };
};

export const gitHubPreSaveTransformDestinationConfig: TPreSaveTransformDestinationConfigFn = async (
  { destinationConfig, existingDestinationConfig, connectionId },
  { appConnectionDAL, kmsService }
) => {
  // An update that only changes the connection still has to be checked against the stored config
  const effectiveDestinationConfig = destinationConfig ?? existingDestinationConfig;
  if (effectiveDestinationConfig?.secretType !== GitHubSyncSecretType.Codespaces) return destinationConfig;

  const appConnection = await appConnectionDAL.findById(connectionId);
  if (!appConnection) throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService,
    projectId: appConnection.projectId
  })) as TGitHubConnection["credentials"];

  if (isGitHubServerConnection(credentials)) {
    throw new BadRequestError({ message: CODESPACES_ON_GITHUB_SERVER_MESSAGE });
  }

  return destinationConfig;
};

export const GithubSyncFns = {
  syncSecrets: async (
    secretSync: TGitHubSyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
    gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
    gitHubAppDeps: TGitHubAppCredentialResolverDeps
  ) => {
    const deps = { gatewayV2Service, gatewayPoolService };
    const ogSecretMap = payload.flatten();
    const secretMap = Object.fromEntries(Object.entries(ogSecretMap).map(([i, v]) => [i.toUpperCase(), v]));

    assertGitHubSecretNames(Object.keys(secretMap));

    const { name: secretTypeName, limit } = GITHUB_SECRET_TYPES[getGitHubSyncSecretType(secretSync.destinationConfig)];
    const level = secretSync.destinationConfig.scope === GitHubSyncScope.Organization ? "organization" : "repository";

    if (Object.values(secretMap).length > limit[level]) {
      throw new SecretSyncError({
        message: `GitHub does not support storing more than ${limit[level].toLocaleString("en-US")} ${secretTypeName} secrets at the ${level} level.`,
        shouldRetry: false
      });
    }

    const { resolvedSync, token } = await resolveGitHubSyncConnection(secretSync, deps, gitHubAppDeps);

    const encryptedSecrets = await getEncryptedSecrets(resolvedSync, deps, gitHubAppDeps);
    const publicKey = await getPublicKey(resolvedSync, deps, token);

    await sodium.ready;
    const binaryKey = sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL);

    for await (const key of Object.keys(secretMap)) {
      const binarySecretValue = sodium.from_string(secretMap[key].value);

      const encryptedBytes = sodium.crypto_box_seal(binarySecretValue, binaryKey);

      const encryptedSecretValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

      try {
        await putSecret(resolvedSync, deps, token, {
          secret_name: key,
          encrypted_value: encryptedSecretValue,
          key_id: publicKey.key_id
        });
      } catch (error) {
        if (error instanceof SecretSyncError) throw error;

        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const encryptedSecret of encryptedSecrets) {
      if (!matchesSchema(encryptedSecret.name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
        // eslint-disable-next-line no-continue
        continue;

      if (!(encryptedSecret.name in secretMap)) {
        await deleteSecret(resolvedSync, deps, token, encryptedSecret);
      }
    }
  },
  getSecrets: async (secretSync: TGitHubSyncWithCredentials) => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },
  removeSecrets: async (
    secretSync: TGitHubSyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
    gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
    gitHubAppDeps: TGitHubAppCredentialResolverDeps
  ) => {
    const deps = { gatewayV2Service, gatewayPoolService };
    const ogSecretMap = payload.flatten();
    const secretMap = Object.fromEntries(Object.entries(ogSecretMap).map(([i, v]) => [i.toUpperCase(), v]));

    const { resolvedSync, token } = await resolveGitHubSyncConnection(secretSync, deps, gitHubAppDeps);

    const encryptedSecrets = await getEncryptedSecrets(resolvedSync, deps, gitHubAppDeps);

    for await (const encryptedSecret of encryptedSecrets) {
      if (encryptedSecret.name in secretMap) {
        await deleteSecret(resolvedSync, deps, token, encryptedSecret);
      }
    }
  }
};
