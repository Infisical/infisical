import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";
import RE2 from "re2";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { request as httpRequest } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";

import { AppConnection } from "../app-connection-enums";
import { GitHubConnectionMethod } from "./github-connection-enums";
import { TGitHubConnection, TGitHubConnectionConfig } from "./github-connection-types";

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
    apiBase = `api.${host}`;
  }

  return apiBase;
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

export const getGitHubAppAuthToken = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const appCfg = getConfig();
  const appId = appCfg.INF_APP_CONNECTION_GITHUB_APP_ID;
  let appPrivateKey = appCfg.INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY;

  if (!appId || !appPrivateKey) {
    throw new InternalServerError({
      message: `GitHub App keys are not configured.`
    });
  }

  appPrivateKey = appPrivateKey
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  if (appConnection.method !== GitHubConnectionMethod.App) {
    throw new InternalServerError({ message: "Cannot generate GitHub App token for non-app connection" });
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + 5 * 60,
    iss: appId
  };

  const appJwt = crypto.jwt().sign(payload, appPrivateKey, { algorithm: "RS256" });

  const apiBaseUrl = await getGitHubInstanceApiUrl(appConnection);
  const { installationId } = appConnection.credentials;

  const gatewayConnectionDetails = appConnection.gatewayId
    ? await getGitHubGatewayConnectionDetails(appConnection.gatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;

  const response = await requestWithGitHubGateway<{ token: string; expires_at: string }>(
    appConnection,
    gatewayService,
    gatewayV2Service,
    {
      url: `https://${apiBaseUrl}/app/installations/${installationId}/access_tokens`,
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
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
  path: string,
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
      token = await getGitHubAppAuthToken(appConnection, gatewayService, gatewayV2Service);
  }

  const baseUrl = `https://${await getGitHubInstanceApiUrl(appConnection)}${path}`;
  const initialUrlObj = new URL(baseUrl);
  initialUrlObj.searchParams.set("per_page", "100");

  const apiBaseUrl = await getGitHubInstanceApiUrl(appConnection);
  const gatewayConnectionDetails = appConnection.gatewayId
    ? await getGitHubGatewayConnectionDetails(appConnection.gatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;

  let results: T[] = [];
  const maxIterations = 1000;

  // Make initial request to get link header
  const firstResponse: AxiosResponse<R> = await requestWithGitHubGateway<R>(
    appConnection,
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
          appConnection,
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
        appConnection,
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
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  if (appConnection.method === GitHubConnectionMethod.App) {
    return makePaginatedGitHubRequest<GitHubRepository, { repositories: GitHubRepository[] }>(
      appConnection,
      gatewayService,
      gatewayV2Service,
      "/installation/repositories",
      (data) => data.repositories
    );
  }

  const repos = await makePaginatedGitHubRequest<GitHubRepository>(
    appConnection,
    gatewayService,
    gatewayV2Service,
    "/user/repos"
  );

  return repos.filter((repo) => repo.permissions?.admin);
};

export const getGitHubOrganizations = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  if (appConnection.method === GitHubConnectionMethod.App) {
    const installationRepositories = await makePaginatedGitHubRequest<
      GitHubRepository,
      { repositories: GitHubRepository[] }
    >(appConnection, gatewayService, gatewayV2Service, "/installation/repositories", (data) => data.repositories);

    const organizationMap: Record<string, GitHubOrganization> = {};
    installationRepositories.forEach((repo) => {
      if (repo.owner.type === "Organization") {
        organizationMap[repo.owner.id] = repo.owner;
      }
    });

    return Object.values(organizationMap);
  }

  return makePaginatedGitHubRequest<GitHubOrganization>(appConnection, gatewayService, gatewayV2Service, "/user/orgs");
};

export const getGitHubEnvironments = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  owner: string,
  repo: string
) => {
  try {
    return await makePaginatedGitHubRequest<GitHubEnvironment, { environments: GitHubEnvironment[] }>(
      appConnection,
      gatewayService,
      gatewayV2Service,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments`,
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

export const validateGitHubConnectionCredentials = async (
  config: TGitHubConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { credentials, method } = config;

  const apiBaseUrl = await getGitHubInstanceApiUrl(config);
  const gatewayConnectionDetails = config.gatewayId
    ? await getGitHubGatewayConnectionDetails(config.gatewayId, apiBaseUrl, gatewayV2Service)
    : undefined;

  // PAT validation
  if (method === GitHubConnectionMethod.Pat) {
    try {
      const apiUrl = await getGitHubInstanceApiUrl(config);
      await requestWithGitHubGateway(
        config,
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

  const {
    INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID,
    INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET,
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID,
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET,
    SITE_URL
  } = getConfig();

  const { clientId, clientSecret } =
    method === GitHubConnectionMethod.App
      ? {
          clientId: INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID,
          clientSecret: INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET
        }
      : // oauth
        {
          clientId: INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID,
          clientSecret: INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET
        };

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

  const oauthGatewayConnectionDetails = config.gatewayId
    ? await getGitHubGatewayConnectionDetails(config.gatewayId, host, gatewayV2Service)
    : undefined;

  try {
    tokenResp = await requestWithGitHubGateway<GithubTokenRespData>(
      config,
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

  if (method === GitHubConnectionMethod.App) {
    if (!tokenResp.data.access_token) {
      throw new InternalServerError({ message: `Missing access token: ${tokenResp.data.error}` });
    }

    const installationsResp = await requestWithGitHubGateway<{
      installations: {
        id: number;
        account: {
          login: string;
          type: string;
          id: number;
        };
      }[];
    }>(
      config,
      gatewayService,
      gatewayV2Service,
      {
        url: `https://${await getGitHubInstanceApiUrl(config)}/user/installations`,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${tokenResp.data.access_token}`,
          "Accept-Encoding": "application/json"
        }
      },
      gatewayConnectionDetails
    );

    const matchingInstallation = installationsResp.data.installations.find(
      (installation) => installation.id === +credentials.installationId
    );

    if (!matchingInstallation) {
      throw new ForbiddenRequestError({
        message: "User does not have access to the provided installation"
      });
    }
  }

  switch (method) {
    case GitHubConnectionMethod.App:
      return {
        installationId: credentials.installationId,
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
