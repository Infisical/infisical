import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";
import RE2 from "re2";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request as httpRequest } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";
import { TGitHubAppDALFactory } from "@app/services/github-app/github-app-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { AppConnection } from "../app-connection-enums";
import { GitHubConnectionMethod } from "./github-connection-enums";
import { TGitHubConnection, TGitHubConnectionConfig } from "./github-connection-types";

export type TGitHubAppCredentialResolverDeps = {
  gitHubAppDAL: Pick<TGitHubAppDALFactory, "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

type TResolvedGitHubAppCredentials = {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  host: string | null;
  instanceType: "cloud" | "server" | null;
};

export const resolveGitHubAppCredentials = async (
  {
    gitHubAppId,
    orgId
  }: {
    gitHubAppId?: string | null;
    orgId: string;
  },
  { gitHubAppDAL, kmsService }: TGitHubAppCredentialResolverDeps
): Promise<TResolvedGitHubAppCredentials> => {
  if (gitHubAppId) {
    const app = await gitHubAppDAL.findOne({ id: gitHubAppId, orgId });
    if (!app) {
      throw new BadRequestError({
        message: `GitHub App with id ${gitHubAppId} not found in this organization.`
      });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    return {
      appId: app.appId,
      slug: app.slug,
      clientId: app.clientId,
      clientSecret: decryptor({ cipherTextBlob: app.encryptedClientSecret }).toString(),
      privateKey: decryptor({ cipherTextBlob: app.encryptedPrivateKey }).toString(),
      host: app.host ?? null,
      instanceType: (app.instanceType as "cloud" | "server" | undefined) ?? "cloud"
    };
  }

  const {
    INF_APP_CONNECTION_GITHUB_APP_ID,
    INF_APP_CONNECTION_GITHUB_APP_SLUG,
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID,
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET,
    INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY
  } = getConfig();

  if (
    !INF_APP_CONNECTION_GITHUB_APP_ID ||
    !INF_APP_CONNECTION_GITHUB_APP_SLUG ||
    !INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID ||
    !INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET ||
    !INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY
  ) {
    throw new InternalServerError({
      message: "GitHub App environment variables have not been configured"
    });
  }

  return {
    appId: INF_APP_CONNECTION_GITHUB_APP_ID,
    slug: INF_APP_CONNECTION_GITHUB_APP_SLUG,
    clientId: INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID,
    clientSecret: INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET,
    privateKey: INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY,
    host: null,
    instanceType: null
  };
};

export type TGitHubAppInstallationsTokenPayload = {
  jti: string;
  orgId: string;
  actorId: string;
  gitHubAppId: string | null;
  host: string;
  instanceType: "cloud" | "server";
  installationIds: string[];
};

export const GITHUB_APP_INSTALLATIONS_TOKEN_TTL = "10m";

export const signGitHubAppInstallationsToken = (payload: TGitHubAppInstallationsTokenPayload) => {
  const { AUTH_SECRET } = getConfig();
  return crypto.jwt().sign(payload, AUTH_SECRET, { expiresIn: GITHUB_APP_INSTALLATIONS_TOKEN_TTL });
};

export const releaseGitHubInstallationsTokenClaim = async (
  installationsToken: string,
  keyStore: Pick<TKeyStoreFactory, "deleteItem">
) => {
  try {
    const { AUTH_SECRET } = getConfig();
    const payload = crypto.jwt().verify(installationsToken, AUTH_SECRET) as TGitHubAppInstallationsTokenPayload;
    if (payload.jti) {
      await keyStore.deleteItem(KeyStorePrefixes.UsedGitHubInstallationsToken(payload.jti));
    }
  } catch {
    // ignore — the claim will expire on its TTL if it can't be released here
  }
};

export const getGitHubConnectionListItem = () => {
  const { INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID, INF_APP_CONNECTION_GITHUB_APP_SLUG } = getConfig();

  return {
    name: "GitHub" as const,
    app: AppConnection.GitHub as const,
    methods: Object.values(GitHubConnectionMethod) as [GitHubConnectionMethod.App, GitHubConnectionMethod.OAuth],
    oauthClientId: INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID,
    appClientSlug: INF_APP_CONNECTION_GITHUB_APP_SLUG
  };
};

export const getGitHubInstanceApiUrl = async (config: {
  credentials: Pick<TGitHubConnectionConfig["credentials"], "host" | "instanceType">;
}) => {
  const host = config.credentials.host || "github.com";

  await blockLocalAndPrivateIpAddresses(`https://${host}`);

  let apiBase: string;
  if (config.credentials.instanceType === "server") {
    apiBase = `${host}/api/v3`;
  } else {
    await blockLocalAndPrivateIpAddresses(`https://api.${host}`);
    apiBase = `api.${host}`;
  }

  return apiBase;
};

export const PLATFORM_GITHUB_CREDENTIAL_HOST = "github.com";

export const assertPlatformGitHubHostAllowed = (host?: string | null) => {
  const { isCloud } = getConfig();
  const normalizedHost = (host || PLATFORM_GITHUB_CREDENTIAL_HOST).trim().toLowerCase();

  if (isCloud && normalizedHost !== PLATFORM_GITHUB_CREDENTIAL_HOST) {
    throw new BadRequestError({
      message:
        "GitHub App and OAuth connections to a custom host (e.g. GitHub Enterprise Server) are only supported on self-hosted Infisical, where you can register your own GitHub App. To use a custom host, self-host Infisical — or use the Personal Access Token method on Infisical Cloud."
    });
  }
};

export const getGitHubGatewayConnectionDetails = async (
  gatewayId: string,
  targetHost: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<Awaited<ReturnType<TGatewayV2ServiceFactory["getPlatformConnectionDetailsByGatewayId"]>> | undefined> => {
  try {
    const urlString = targetHost.includes("://") ? targetHost : `https://${targetHost}`;
    const url = new URL(urlString);
    const { hostname } = url;

    return await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: hostname,
      targetPort: 443
    });
  } catch {
    // Return undefined to allow fallback to V1 gateway
    return undefined;
  }
};

export const requestWithGitHubGateway = async <T>(
  appConnection: { gatewayId?: string | null },
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  requestConfig: AxiosRequestConfig,
  gatewayConnectionDetails?: Awaited<ReturnType<TGatewayV2ServiceFactory["getPlatformConnectionDetailsByGatewayId"]>>
): Promise<AxiosResponse<T>> => {
  const { gatewayId } = appConnection;

  // If gateway isn't set up, don't proxy request
  if (!gatewayId) {
    return httpRequest.request(requestConfig);
  }

  const url = new URL(requestConfig.url as string);

  await blockLocalAndPrivateIpAddresses(url.toString());

  const [targetHost] = await verifyHostInputValidity({ host: url.host, isGateway: true, isDynamicSecret: false });

  const connectionDetails = gatewayConnectionDetails;

  if (connectionDetails) {
    return withGatewayV2Proxy(
      async (proxyPort) => {
        const httpsAgent = new https.Agent({
          servername: targetHost
        });

        url.protocol = "https:";
        url.host = `localhost:${proxyPort}`;

        const finalRequestConfig: AxiosRequestConfig = {
          ...requestConfig,
          url: url.toString(),
          httpsAgent,
          headers: {
            ...requestConfig.headers,
            Host: targetHost
          }
        };

        try {
          return await httpRequest.request(finalRequestConfig);
        } catch (error) {
          const axiosError = error as AxiosError;
          logger.error(
            { message: axiosError.message, data: axiosError.response?.data },
            "Error during GitHub gateway request:"
          );
          throw error;
        }
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: connectionDetails.relayHost,
        gateway: connectionDetails.gateway,
        relay: connectionDetails.relay
      }
    );
  }

  const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);

  return withGatewayProxy(
    async (proxyPort) => {
      const httpsAgent = new https.Agent({
        servername: targetHost
      });

      url.protocol = "https:";
      url.host = `localhost:${proxyPort}`;

      const finalRequestConfig: AxiosRequestConfig = {
        ...requestConfig,
        url: url.toString(),
        httpsAgent,
        headers: {
          ...requestConfig.headers,
          Host: targetHost
        }
      };

      try {
        return await httpRequest.request(finalRequestConfig);
      } catch (error) {
        const axiosError = error as AxiosError;
        logger.error(
          { message: axiosError.message, data: axiosError.response?.data },
          "Error during GitHub gateway request:"
        );
        throw error;
      }
    },
    {
      relayDetails,
      protocol: GatewayProxyProtocol.Tcp,
      targetHost,
      targetPort: 443
    }
  );
};

export const signGitHubAppJwt = (appId: string, privateKey: string) => {
  const appPrivateKey = privateKey
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  const now = Math.floor(Date.now() / 1000);
  return crypto.jwt().sign({ iat: now, exp: now + 5 * 60, iss: appId }, appPrivateKey, { algorithm: "RS256" });
};

export const buildGitHubAppJwtHeaders = (appJwt: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${appJwt}`,
  "X-GitHub-Api-Version": "2022-11-28"
});

export const getGitHubAppAuthToken = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
  deps: TGitHubAppCredentialResolverDeps
) => {
  if (appConnection.method !== GitHubConnectionMethod.App) {
    throw new InternalServerError({ message: "Cannot generate GitHub App token for non-app connection" });
  }

  const {
    appId,
    privateKey,
    host: appHost,
    instanceType: appInstanceType
  } = await resolveGitHubAppCredentials(
    { gitHubAppId: appConnection.credentials.gitHubAppId, orgId: appConnection.orgId },
    deps
  );

  // For an org-managed app, target the host the app is bound to rather than the host stored on the
  // connection — the signed app JWT must never leave for a host that isn't the app's own.
  const effectiveCredentials = appConnection.credentials.gitHubAppId
    ? { host: appHost ?? undefined, instanceType: appInstanceType ?? "cloud" }
    : { host: appConnection.credentials.host, instanceType: appConnection.credentials.instanceType };

  assertPlatformGitHubHostAllowed(effectiveCredentials.host);

  const appJwt = signGitHubAppJwt(appId, privateKey);

  const apiBaseUrl = await getGitHubInstanceApiUrl({ credentials: effectiveCredentials });
  const { installationId } = appConnection.credentials;

  const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
    gatewayId: appConnection.gatewayId,
    gatewayPoolId: appConnection.gatewayPoolId
  });

  const gatewayConnectionDetails = effectiveGatewayId
    ? await getGitHubGatewayConnectionDetails(effectiveGatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;

  const response = await requestWithGitHubGateway<{ token: string; expires_at: string }>(
    { gatewayId: effectiveGatewayId },
    gatewayService,
    gatewayV2Service,
    {
      url: `https://${apiBaseUrl}/app/installations/${installationId}/access_tokens`,
      method: "POST",
      headers: buildGitHubAppJwtHeaders(appJwt)
    },
    gatewayConnectionDetails
  );

  return response.data.token;
};

const parseGitHubLinkHeader = (linkHeader: string | undefined): Record<string, string> => {
  if (!linkHeader) return {};

  const links: Record<string, string> = {};
  const segments = linkHeader.split(",");
  const re = new RE2(/<([^>]+)>;\s*rel="([^"]+)"/);

  for (const segment of segments) {
    const match = re.exec(segment.trim());
    if (match) {
      const url = match[1];
      const rel = match[2];
      links[rel] = url;
    }
  }
  return links;
};

function extractNextPageUrl(linkHeader: string | undefined): string | null {
  const links = parseGitHubLinkHeader(linkHeader);
  return links.next || null;
}

export const makePaginatedGitHubRequest = async <T, R = T[]>(
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
  path: string,
  deps: TGitHubAppCredentialResolverDeps,
  dataMapper?: (data: R) => T[]
): Promise<T[]> => {
  const { credentials, method } = appConnection;

  let token: string;

  switch (method) {
    case GitHubConnectionMethod.OAuth:
      token = credentials.accessToken;
      break;
    case GitHubConnectionMethod.Pat:
      token = credentials.personalAccessToken;
      break;
    default:
      token = await getGitHubAppAuthToken(appConnection, gatewayService, gatewayV2Service, gatewayPoolService, deps);
  }

  const apiBaseUrl = await getGitHubInstanceApiUrl(appConnection);
  const initialUrlObj = new URL(`https://${apiBaseUrl}${path}`);
  initialUrlObj.searchParams.set("per_page", "100");

  const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
    gatewayId: appConnection.gatewayId,
    gatewayPoolId: appConnection.gatewayPoolId
  });
  const gatewayConnectionDetails = effectiveGatewayId
    ? await getGitHubGatewayConnectionDetails(effectiveGatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;
  const resolvedConn = { gatewayId: effectiveGatewayId };

  let results: T[] = [];
  const maxIterations = 1000;

  // Make initial request to get link header
  const firstResponse: AxiosResponse<R> = await requestWithGitHubGateway<R>(
    resolvedConn,
    gatewayService,
    gatewayV2Service,
    {
      url: initialUrlObj.toString(),
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    },
    gatewayConnectionDetails
  );

  const firstPageItems = dataMapper ? dataMapper(firstResponse.data) : (firstResponse.data as unknown as T[]);
  results = results.concat(firstPageItems);

  const linkHeader = parseGitHubLinkHeader(firstResponse.headers.link as string | undefined);
  const lastPageUrl = linkHeader.last;

  // If there's a last page URL, get its page number and concurrently fetch every page starting from 2 to last
  if (lastPageUrl) {
    const lastPageParam = new URL(lastPageUrl).searchParams.get("page");
    const totalPages = lastPageParam ? parseInt(lastPageParam, 10) : 1;

    const pageRequests: Promise<AxiosResponse<R>>[] = [];

    for (let pageNum = 2; pageNum <= totalPages && pageNum - 1 < maxIterations; pageNum += 1) {
      const pageUrlObj = new URL(initialUrlObj.toString());
      pageUrlObj.searchParams.set("page", pageNum.toString());

      pageRequests.push(
        requestWithGitHubGateway<R>(
          resolvedConn,
          gatewayService,
          gatewayV2Service,
          {
            url: pageUrlObj.toString(),
            method: "GET",
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2022-11-28"
            }
          },
          gatewayConnectionDetails
        )
      );
    }
    const responses = await Promise.all(pageRequests);

    for (const response of responses) {
      const items = dataMapper ? dataMapper(response.data) : (response.data as unknown as T[]);
      results = results.concat(items);
    }
  } else {
    // Fallback in case last link isn't present
    let url: string | null = extractNextPageUrl(firstResponse.headers.link as string | undefined);
    let i = 1;

    while (url && i < maxIterations) {
      // eslint-disable-next-line no-await-in-loop
      const response: AxiosResponse<R> = await requestWithGitHubGateway<R>(
        resolvedConn,
        gatewayService,
        gatewayV2Service,
        {
          url,
          method: "GET",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28"
          }
        },
        gatewayConnectionDetails
      );

      const items = dataMapper ? dataMapper(response.data) : (response.data as unknown as T[]);
      results = results.concat(items);

      url = extractNextPageUrl(response.headers.link as string | undefined);
      i += 1;
    }
  }

  return results;
};

type GitHubOrganization = {
  login: string;
  id: number;
  type: string;
};

type GitHubRepository = {
  id: number;
  name: string;
  owner: GitHubOrganization;
  permissions?: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
};

type GitHubEnvironment = {
  id: number;
  name: string;
};

export const getGitHubRepositories = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
  deps: TGitHubAppCredentialResolverDeps
) => {
  if (appConnection.method === GitHubConnectionMethod.App) {
    return makePaginatedGitHubRequest<GitHubRepository, { repositories: GitHubRepository[] }>(
      appConnection,
      gatewayService,
      gatewayV2Service,
      gatewayPoolService,
      "/installation/repositories",
      deps,
      (data) => data.repositories
    );
  }

  const repos = await makePaginatedGitHubRequest<GitHubRepository>(
    appConnection,
    gatewayService,
    gatewayV2Service,
    gatewayPoolService,
    "/user/repos",
    deps
  );

  return repos.filter((repo) => repo.permissions?.admin);
};

export const getGitHubOrganizations = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
  deps: TGitHubAppCredentialResolverDeps
) => {
  if (appConnection.method === GitHubConnectionMethod.App) {
    const installationRepositories = await makePaginatedGitHubRequest<
      GitHubRepository,
      { repositories: GitHubRepository[] }
    >(
      appConnection,
      gatewayService,
      gatewayV2Service,
      gatewayPoolService,
      "/installation/repositories",
      deps,
      (data) => data.repositories
    );

    const organizationMap: Record<string, GitHubOrganization> = {};
    installationRepositories.forEach((repo) => {
      if (repo.owner.type === "Organization") {
        organizationMap[repo.owner.id] = repo.owner;
      }
    });

    return Object.values(organizationMap);
  }

  return makePaginatedGitHubRequest<GitHubOrganization>(
    appConnection,
    gatewayService,
    gatewayV2Service,
    gatewayPoolService,
    "/user/orgs",
    deps
  );
};

export const getGitHubEnvironments = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">,
  owner: string,
  repo: string,
  deps: TGitHubAppCredentialResolverDeps
) => {
  try {
    return await makePaginatedGitHubRequest<GitHubEnvironment, { environments: GitHubEnvironment[] }>(
      appConnection,
      gatewayService,
      gatewayV2Service,
      gatewayPoolService,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments`,
      deps,
      (data) => data.environments
    );
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response?.status === 404) return [];
    throw error;
  }
};

export type GithubTokenRespData = {
  access_token?: string;
  scope: string;
  token_type: string;
  error?: string;
};

export function isGithubErrorResponse(data: GithubTokenRespData): data is GithubTokenRespData & {
  error: string;
  error_description: string;
  error_uri: string;
} {
  return "error" in data;
}

export type TGitHubUserInstallation = {
  id: number;
  app_id: number;
  account: {
    login: string;
    type: string;
  };
};

export const listGitHubUserInstallations = async (
  apiBaseUrl: string,
  accessToken: string,
  requestFn: (
    requestConfig: AxiosRequestConfig & { url: string }
  ) => Promise<AxiosResponse<{ installations: TGitHubUserInstallation[] }>>
): Promise<TGitHubUserInstallation[]> => {
  const installations: TGitHubUserInstallation[] = [];
  const MAX_PAGES = 100;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await requestFn({
      url: `https://${apiBaseUrl}/user/installations`,
      method: "GET",
      params: { per_page: 100, page },
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    const pageInstallations = data.installations ?? [];
    installations.push(...pageInstallations);

    if (pageInstallations.length < 100) {
      break;
    }
  }

  return installations;
};

export const validateGitHubConnectionCredentials = async (
  config: TGitHubConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  deps: TGitHubAppCredentialResolverDeps & {
    keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
    actorId?: string;
  }
) => {
  const { credentials, method } = config;

  let resolvedAppCredentials: TResolvedGitHubAppCredentials | undefined;
  if (method === GitHubConnectionMethod.App) {
    resolvedAppCredentials = await resolveGitHubAppCredentials(
      { gitHubAppId: credentials.gitHubAppId, orgId: config.orgId },
      deps
    );

    if (credentials.gitHubAppId) {
      const mutableCredentials = credentials as { host?: string; instanceType: "cloud" | "server" };
      mutableCredentials.host = resolvedAppCredentials.host ?? undefined;
      mutableCredentials.instanceType = resolvedAppCredentials.instanceType ?? "cloud";
    }
  }

  if (method === GitHubConnectionMethod.App && credentials.installationsToken) {
    const { AUTH_SECRET } = getConfig();

    let tokenPayload: TGitHubAppInstallationsTokenPayload & { exp: number };
    try {
      tokenPayload = crypto
        .jwt()
        .verify(credentials.installationsToken, AUTH_SECRET) as TGitHubAppInstallationsTokenPayload & { exp: number };
    } catch {
      throw new BadRequestError({
        message: "Invalid or expired GitHub installation token. Please reconnect and try again."
      });
    }

    if (!tokenPayload.jti || !Array.isArray(tokenPayload.installationIds)) {
      throw new BadRequestError({
        message: "Invalid or expired GitHub installation token. Please reconnect and try again."
      });
    }

    if (tokenPayload.orgId !== config.orgId || (deps.actorId && tokenPayload.actorId !== deps.actorId)) {
      throw new ForbiddenRequestError({
        message: "GitHub installation token does not belong to this actor or organization."
      });
    }

    if ((tokenPayload.gitHubAppId ?? null) !== (credentials.gitHubAppId ?? null)) {
      throw new BadRequestError({
        message: "GitHub installation token was issued for a different GitHub App."
      });
    }

    if (!tokenPayload.installationIds.includes(credentials.installationId)) {
      throw new ForbiddenRequestError({
        message: "User does not have access to the provided installation"
      });
    }

    const boundHost = credentials.gitHubAppId
      ? (resolvedAppCredentials!.host ?? undefined)
      : tokenPayload.host || undefined;
    const boundInstanceType = credentials.gitHubAppId
      ? (resolvedAppCredentials!.instanceType ?? "cloud")
      : tokenPayload.instanceType;

    assertPlatformGitHubHostAllowed(boundHost);

    const ttlSeconds = Math.max(1, tokenPayload.exp - Math.floor(Date.now() / 1000));
    const claimed = await deps.keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.UsedGitHubInstallationsToken(tokenPayload.jti),
      ttlSeconds,
      "1"
    );
    if (!claimed) {
      throw new BadRequestError({
        message: "This GitHub installation token has already been used. Please reconnect and try again."
      });
    }

    return {
      installationId: credentials.installationId,
      gitHubAppId: credentials.gitHubAppId ?? null,
      instanceType: boundInstanceType,
      host: boundHost
    };
  }

  if (method === GitHubConnectionMethod.App && !credentials.code) {
    throw new BadRequestError({ message: "GitHub App code required" });
  }

  const apiBaseUrl = await getGitHubInstanceApiUrl(config);
  const gatewayConnectionDetails = config.gatewayId
    ? await getGitHubGatewayConnectionDetails(config.gatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;
  const resolvedConfig = { gatewayId: config.gatewayId };

  // PAT validation
  if (method === GitHubConnectionMethod.Pat) {
    try {
      const apiUrl = await getGitHubInstanceApiUrl(config);
      await requestWithGitHubGateway(
        resolvedConfig,
        gatewayService,
        gatewayV2Service,
        {
          url: `https://${apiUrl}/user`,
          method: "GET",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${credentials.personalAccessToken}`,
            "X-GitHub-Api-Version": "2022-11-28"
          }
        },
        gatewayConnectionDetails
      );

      return {
        personalAccessToken: credentials.personalAccessToken,
        instanceType: credentials.instanceType,
        host: credentials.host
      };
    } catch (e: unknown) {
      logger.error(e, "Unable to verify GitHub PAT connection");

      throw new BadRequestError({
        message: "Unable to validate Personal Access Token: verify token has proper permissions"
      });
    }
  }

  const { INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID, INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET, SITE_URL } =
    getConfig();

  let clientId: string | undefined;
  let clientSecret: string | undefined;

  if (method === GitHubConnectionMethod.App) {
    // Resolved above so the host could be bound before any credential use.
    clientId = resolvedAppCredentials!.clientId;
    clientSecret = resolvedAppCredentials!.clientSecret;
  } else {
    clientId = INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID;
    clientSecret = INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET;
  }

  if (!clientId || !clientSecret) {
    throw new InternalServerError({
      message: `GitHub ${getAppConnectionMethodName(method).replace(
        "GitHub",
        ""
      )} environment variables have not been configured`
    });
  }

  let tokenResp: AxiosResponse<GithubTokenRespData>;
  const host = credentials.host || "github.com";

  assertPlatformGitHubHostAllowed(host);

  const oauthGatewayConnectionDetails = config.gatewayId
    ? await getGitHubGatewayConnectionDetails(config.gatewayId, host, gatewayV2Service)
    : undefined;

  try {
    tokenResp = await requestWithGitHubGateway<GithubTokenRespData>(
      resolvedConfig,
      gatewayService,
      gatewayV2Service,
      {
        url: `https://${host}/login/oauth/access_token`,
        method: "POST",
        data: {
          client_id: clientId,
          client_secret: clientSecret,
          code: credentials.code,
          redirect_uri: `${SITE_URL}/organization/app-connections/github/oauth/callback`
        },
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      },
      oauthGatewayConnectionDetails
    );

    if (isGithubErrorResponse(tokenResp?.data)) {
      throw new BadRequestError({
        message: `Unable to validate credentials: GitHub responded with an error: ${tokenResp.data.error} - ${tokenResp.data.error_description}`
      });
    }
  } catch (e: unknown) {
    logger.error(e, "Unable to verify GitHub connection");

    if (e instanceof BadRequestError) {
      throw e;
    }

    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  if (tokenResp.status !== 200) {
    throw new BadRequestError({
      message: `Unable to validate credentials: GitHub responded with a status code of ${tokenResp.status} (${tokenResp.statusText}). Verify credentials and try again.`
    });
  }

  let resolvedInstallationId: string | undefined;

  if (method === GitHubConnectionMethod.App) {
    if (!tokenResp.data.access_token) {
      throw new InternalServerError({ message: `Missing access token: ${tokenResp.data.error}` });
    }

    // installations are scoped to this GitHub App since the token is a user-to-server token
    const installations = await listGitHubUserInstallations(apiBaseUrl, tokenResp.data.access_token, (requestConfig) =>
      requestWithGitHubGateway<{ installations: TGitHubUserInstallation[] }>(
        resolvedConfig,
        gatewayService,
        gatewayV2Service,
        requestConfig,
        gatewayConnectionDetails
      )
    );

    // The installation is selected through GitHub's own install UI and returned to us as an explicit
    // installationId (required) — never auto-resolved from the user's accessible installations, so we
    // can't bind to an account the user merely belongs to rather than one they intended.
    const { installationId } = credentials;
    const matchingInstallation = installations.find((installation) => installation.id === +installationId);

    if (!matchingInstallation) {
      throw new ForbiddenRequestError({
        message: "User does not have access to the provided installation"
      });
    }

    resolvedInstallationId = installationId;
  }

  switch (method) {
    case GitHubConnectionMethod.App:
      return {
        installationId: resolvedInstallationId as string,
        gitHubAppId: credentials.gitHubAppId ?? null,
        instanceType: credentials.instanceType,
        host: credentials.host
      };
    case GitHubConnectionMethod.OAuth:
      return {
        accessToken: tokenResp.data.access_token,
        instanceType: credentials.instanceType,
        host: credentials.host
      };
    default:
      throw new InternalServerError({
        message: `Unhandled GitHub connection method: ${method as GitHubConnectionMethod}`
      });
  }
};
