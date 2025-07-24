import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { getConfig } from "@app/lib/config/env";
import { request as httpRequest } from "@app/lib/config/request";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { logger } from "@app/lib/logger";
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

export const getGitHubClient = (
  appConnection: TGitHubConnection,
  octokitOptions: Partial<{ baseUrl: string; request: { agent?: https.Agent } }>
) => {
  const appCfg = getConfig();

  const { method, credentials } = appConnection;
  const { baseUrl, request } = octokitOptions;

  let client: Octokit;

  const appId = appCfg.INF_APP_CONNECTION_GITHUB_APP_ID;
  const appPrivateKey = appCfg.INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY;

  switch (method) {
    case GitHubConnectionMethod.App:
      if (!appId || !appPrivateKey) {
        throw new InternalServerError({
          message: `GitHub ${getAppConnectionMethodName(method).replace("GitHub", "")} has not been configured`
        });
      }

      client = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId,
          privateKey: appPrivateKey,
          installationId: credentials.installationId
        },
        baseUrl,
        request
      });
      break;
    case GitHubConnectionMethod.OAuth:
      client = new Octokit({
        auth: credentials.accessToken,
        baseUrl,
        request
      });
      break;
    default:
      throw new InternalServerError({
        message: `Unhandled GitHub connection method: ${method as GitHubConnectionMethod}`
      });
  }

  return client;
};

export const executeWithGitHubGateway = async <T>(
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  operation: (client: Octokit) => Promise<T>
): Promise<T> => {
  const {
    gatewayId,
    credentials: { host: hostParam }
  } = appConnection;

  const host = hostParam || "api.github.com";

  if (gatewayId && gatewayService) {
    const [targetHost] = await verifyHostInputValidity(host, true);
    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

    return withGatewayProxy(
      async (proxyPort) => {
        const agent = new https.Agent({
          servername: targetHost,
          rejectUnauthorized: true
        });

        const client = getGitHubClient(appConnection, {
          baseUrl: `https://localhost:${proxyPort}`,
          request: { agent }
        });

        return operation(client);
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
  }

  // Non-gateway path
  const client = getGitHubClient(appConnection, {
    baseUrl: `https://${host}`
  });

  return operation(client);
};

// For non-octokit requests
export const requestWithGitHubGateway = async <T>(
  appConnection: TGitHubConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  requestConfig: AxiosRequestConfig
): Promise<AxiosResponse<T>> => {
  const {
    gatewayId,
    credentials: { host: hostParam }
  } = appConnection;

  const url = new URL(requestConfig.url as string);
  const host = hostParam || url.host || "github.com";

  if (gatewayId && gatewayService) {
    const [targetHost] = await verifyHostInputValidity(host, true);
    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

    return withGatewayProxy(
      async (proxyPort) => {
        const proxyAgent = new https.Agent({
          servername: targetHost,
          rejectUnauthorized: true
        });

        url.protocol = "https:";
        url.host = `localhost:${proxyPort}`;

        const finalRequestConfig: AxiosRequestConfig = {
          ...requestConfig,
          url: url.toString(),
          httpsAgent: proxyAgent,
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
  }

  if (!url.host) {
    url.protocol = "https:";
    url.host = host;
  }

  const finalRequestConfig: AxiosRequestConfig = {
    ...requestConfig,
    url: url.toString()
  };

  return httpRequest.request(finalRequestConfig);
};

type GitHubOrganization = {
  login: string;
  id: number;
};

type GitHubRepository = {
  id: number;
  name: string;
  owner: GitHubOrganization;
};

export const getGitHubRepositories = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  return executeWithGitHubGateway(appConnection, gatewayService, async (client) => {
    let repositories: GitHubRepository[];

    switch (appConnection.method) {
      case GitHubConnectionMethod.App:
        repositories = await client.paginate("GET /installation/repositories");
        break;
      case GitHubConnectionMethod.OAuth:
      default:
        repositories = (await client.paginate("GET /user/repos")).filter((repo) => repo.permissions?.admin);
        break;
    }

    return repositories;
  });
};

export const getGitHubOrganizations = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  return executeWithGitHubGateway(appConnection, gatewayService, async (client) => {
    let organizations: GitHubOrganization[];

    switch (appConnection.method) {
      case GitHubConnectionMethod.App: {
        const installationRepositories = await client.paginate("GET /installation/repositories");

        const organizationMap: Record<string, GitHubOrganization> = {};

        installationRepositories.forEach((repo) => {
          if (repo.owner.type === "Organization") {
            organizationMap[repo.owner.id] = repo.owner;
          }
        });

        organizations = Object.values(organizationMap);

        break;
      }
      case GitHubConnectionMethod.OAuth:
      default:
        organizations = await client.paginate("GET /user/orgs");
        break;
    }

    return organizations;
  });
};

export const getGitHubEnvironments = async (
  appConnection: TGitHubConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  owner: string,
  repo: string
) => {
  return executeWithGitHubGateway(appConnection, gatewayService, async (client) => {
    try {
      const environments = await client.paginate("GET /repos/{owner}/{repo}/environments", {
        owner,
        repo
      });

      return environments;
    } catch (e) {
      // repo doesn't have envs
      if ((e as { status: number }).status === 404) {
        return [];
      }

      throw e;
    }
  });
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
  const apiHost = credentials.host ? `api.${credentials.host}` : "api.github.com";

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
      url: IntegrationUrls.GITHUB_USER_INSTALLATIONS.replace("api.github.com", apiHost),
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
