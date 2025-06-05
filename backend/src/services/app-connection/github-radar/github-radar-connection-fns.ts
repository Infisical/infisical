import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { GitHubRadarConnectionMethod } from "./github-radar-connection-enums";
import {
  TGitHubRadarConnection,
  TGitHubRadarConnectionConfig,
  TGitHubRadarRepository
} from "./github-radar-connection-types";

export const getGitHubRadarConnectionListItem = () => {
  const { INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG } = getConfig();

  return {
    name: "GitHub Radar" as const,
    app: AppConnection.GitHubRadar as const,
    methods: Object.values(GitHubRadarConnectionMethod) as [GitHubRadarConnectionMethod.App],
    appClientSlug: INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG
  };
};

export const getGitHubRadarClient = (appConnection: TGitHubRadarConnection) => {
  const appCfg = getConfig();

  const { method, credentials } = appConnection;

  let client: Octokit;

  switch (method) {
    case GitHubRadarConnectionMethod.App:
      if (!appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID || !appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY) {
        throw new InternalServerError({
          message: `GitHub ${getAppConnectionMethodName(method).replace(
            "GitHub",
            ""
          )} environment variables have not been configured`
        });
      }

      client = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID,
          privateKey: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY,
          installationId: credentials.installationId
        }
      });
      break;
    default:
      throw new InternalServerError({
        message: `Unhandled GitHub Radar connection method: ${method as GitHubRadarConnectionMethod}`
      });
  }

  return client;
};

export const listGitHubRadarRepositories = async (appConnection: TGitHubRadarConnection) => {
  const client = getGitHubRadarClient(appConnection);

  const repositories: TGitHubRadarRepository[] = await client.paginate("GET /installation/repositories");

  return repositories;
};

type TokenRespData = {
  access_token: string;
  scope: string;
  token_type: string;
  error?: string;
};

export const validateGitHubRadarConnectionCredentials = async (config: TGitHubRadarConnectionConfig) => {
  const { credentials, method } = config;

  const { INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID, INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET, SITE_URL } =
    getConfig();

  if (!INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID || !INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET) {
    throw new InternalServerError({
      message: `GitHub ${getAppConnectionMethodName(method).replace(
        "GitHub",
        ""
      )} environment variables have not been configured`
    });
  }

  let tokenResp: AxiosResponse<TokenRespData>;

  try {
    tokenResp = await request.get<TokenRespData>("https://github.com/login/oauth/access_token", {
      params: {
        client_id: INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID,
        client_secret: INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET,
        code: credentials.code,
        redirect_uri: `${SITE_URL}/organization/app-connections/github-radar/oauth/callback`
      },
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "application/json"
      }
    });
  } catch (e: unknown) {
    throw new BadRequestError({
      message: `Unable to validate connection: verify credentials`
    });
  }

  if (tokenResp.status !== 200) {
    throw new BadRequestError({
      message: `Unable to validate credentials: GitHub responded with a status code of ${tokenResp.status} (${tokenResp.statusText}). Verify credentials and try again.`
    });
  }

  if (method === GitHubRadarConnectionMethod.App) {
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

  if (!tokenResp.data.access_token) {
    throw new InternalServerError({ message: `Missing access token: ${tokenResp.data.error}` });
  }

  switch (method) {
    case GitHubRadarConnectionMethod.App:
      return {
        installationId: credentials.installationId
      };
    default:
      throw new InternalServerError({
        message: `Unhandled GitHub connection method: ${method as GitHubRadarConnectionMethod}`
      });
  }
};
