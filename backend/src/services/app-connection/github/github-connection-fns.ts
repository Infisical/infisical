import { createAppAuth } from "@octokit/auth-app";
import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";
import RE2 from "re2";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { getConfig } from "@app/lib/config/env";
import { request as httpRequest } from "@app/lib/config/request";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

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

export const requestWithGitHubGateway = async <T>(
  appConnection: { gatewayId?: string | null },
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  requestConfig: AxiosRequestConfig
): Promise<AxiosResponse<T>> => {
  const { gatewayId } = appConnection;

  // If gateway isn't set up, don't proxy request
  if (!gatewayId) {
    return httpRequest.request(requestConfig);
  }

  const url = new URL(requestConfig.url as string);

  await blockLocalAndPrivateIpAddresses(url.toString());

  const [targetHost] = await verifyHostInputValidity(url.host, true);
  const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
  const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

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
        logger.error("Error during GitHub gateway request:", axiosError.message, axiosError.response?.data);
        throw error;
      }
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      targetHost,
      targetPort: 443,
      relayHost,
      relayPort: Number(relayPort),
      identityId: relayDetails.identityId,
      orgId: relayDetails.orgId,
      tlsOptions: {
        ca: relayDetails.certChain,
        cert: relayDetails.certificate,
        key: relayDetails.privateKey.toString()
      }
    }
  );
};

export const getGitHubAppAuthToken = async (appConnection: TGitHubConnection) => {
  const appCfg = getConfig();
  const appId = appCfg.INF_APP_CONNECTION_GITHUB_APP_ID;
  const appPrivateKey = appCfg.INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY;

  if (!appId || !appPrivateKey) {
    throw new InternalServerError({
      message: `GitHub App keys are not configured.`
    });
  }

  if (appConnection.method !== GitHubConnectionMethod.App) {
    throw new InternalServerError({ message: "Cannot generate GitHub App token for non-app connection" });
  }

  const appAuth = createAppAuth({
    appId,
    privateKey: appPrivateKey,
    installationId: appConnection.credentials.installationId
  });

  const { token } = await appAuth({ type: "installation" });
  return token;
};

function extractNextPageUrl(linkHeader: string | undefined): string | null {
  if (!linkHeader) return null;

  const links = linkHeader.split(",");
  const nextLink = links.find((link) => link.includes('rel="next"'));

  if (!nextLink) return null;

  const match = new RE2(/<([^>]+)>/).exec(nextLink);
  return match ? match[1] : null;
}

export const makePaginatedGitHubRequest = async <T, R = T[]>(
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  path: string,
  dataMapper?: (data: R) => T[]
): Promise<T[]> => {
  const { credentials, method } = appConnection;

  const token =
    method === GitHubConnectionMethod.OAuth ? credentials.accessToken : await getGitHubAppAuthToken(appConnection);
  let url: string | null = `https://api.${credentials.host || "github.com"}${path}`;
  let results: T[] = [];
  let i = 0;

  while (url && i < 1000) {
    // eslint-disable-next-line no-await-in-loop
    const response: AxiosResponse<R> = await requestWithGitHubGateway<R>(appConnection, gatewayService, {
      url,
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    const items = dataMapper ? dataMapper(response.data) : (response.data as unknown as T[]);
    results = results.concat(items);

    url = extractNextPageUrl(response.headers.link as string | undefined);
    i += 1;
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
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  if (appConnection.method === GitHubConnectionMethod.App) {
    return makePaginatedGitHubRequest<GitHubRepository, { repositories: GitHubRepository[] }>(
      appConnection,
      gatewayService,
      "/installation/repositories",
      (data) => data.repositories
    );
  }

  const repos = await makePaginatedGitHubRequest<GitHubRepository>(appConnection, gatewayService, "/user/repos");
  return repos.filter((repo) => repo.permissions?.admin);
};

export const getGitHubOrganizations = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  if (appConnection.method === GitHubConnectionMethod.App) {
    const installationRepositories = await makePaginatedGitHubRequest<
      GitHubRepository,
      { repositories: GitHubRepository[] }
    >(appConnection, gatewayService, "/installation/repositories", (data) => data.repositories);

    const organizationMap: Record<string, GitHubOrganization> = {};
    installationRepositories.forEach((repo) => {
      if (repo.owner.type === "Organization") {
        organizationMap[repo.owner.id] = repo.owner;
      }
    });

    return Object.values(organizationMap);
  }

  return makePaginatedGitHubRequest<GitHubOrganization>(appConnection, gatewayService, "/user/orgs");
};

export const getGitHubEnvironments = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  owner: string,
  repo: string
) => {
  try {
    return await makePaginatedGitHubRequest<GitHubEnvironment, { environments: GitHubEnvironment[] }>(
      appConnection,
      gatewayService,
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
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const { credentials, method } = config;
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

  try {
    tokenResp = await requestWithGitHubGateway<GithubTokenRespData>(config, gatewayService, {
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
    });

    if (isGithubErrorResponse(tokenResp?.data)) {
      throw new BadRequestError({
        message: `Unable to validate credentials: GitHub responded with an error: ${tokenResp.data.error} - ${tokenResp.data.error_description}`
      });
    }
  } catch (e: unknown) {
    if (e instanceof BadRequestError) {
      throw e;
    }

    throw new BadRequestError({
      message: `Unable to validate connection: verify credentials`
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
    }>(config, gatewayService, {
      url: IntegrationUrls.GITHUB_USER_INSTALLATIONS.replace("api.github.com", `api.${host}`),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${tokenResp.data.access_token}`,
        "Accept-Encoding": "application/json"
      }
    });

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
        installationId: credentials.installationId
      };
    case GitHubConnectionMethod.OAuth:
      return {
        accessToken: tokenResp.data.access_token
      };
    default:
      throw new InternalServerError({
        message: `Unhandled GitHub connection method: ${method as GitHubConnectionMethod}`
      });
  }
};
