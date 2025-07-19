import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
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

export const getGitHubClient = (appConnection: TGitHubConnection) => {
  const appCfg = getConfig();

  const { method, credentials } = appConnection;

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
        }
      });
      break;
    case GitHubConnectionMethod.OAuth:
      client = new Octokit({
        auth: credentials.accessToken
      });
      break;
    default:
      throw new InternalServerError({
        message: `Unhandled GitHub connection method: ${method as GitHubConnectionMethod}`
      });
  }

  return client;
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

export const getGitHubRepositories = async (appConnection: TGitHubConnection) => {
  const client = getGitHubClient(appConnection);

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
};

export const getGitHubOrganizations = async (appConnection: TGitHubConnection) => {
  const client = getGitHubClient(appConnection);

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
};

export const getGitHubEnvironments = async (appConnection: TGitHubConnection, owner: string, repo: string) => {
  const client = getGitHubClient(appConnection);

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

export const validateGitHubConnectionCredentials = async (config: TGitHubConnectionConfig) => {
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

  try {
    tokenResp = await request.get<GithubTokenRespData>("https://github.com/login/oauth/access_token", {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        code: credentials.code,
        redirect_uri: `${SITE_URL}/organization/app-connections/github/oauth/callback`
      },
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "application/json"
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

    const installationsResp = await request.get<{
      installations: {
        id: number;
        account: {
          login: string;
          type: string;
          id: number;
        };
      }[];
    }>(IntegrationUrls.GITHUB_USER_INSTALLATIONS, {
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
