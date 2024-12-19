import { AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { GitHubConnectionMethod } from "./github-connection-enums";
import { TGitHubConnectionConfig } from "./github-connection-types";

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

type TokenRespData = {
  access_token: string;
  scope: string;
  token_type: string;
};

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
      message: `GitHub ${getAppConnectionMethodName(method)} environment variables have not been configured`
    });
  }

  let tokenResp: AxiosResponse<TokenRespData>;

  try {
    tokenResp = await request.get<TokenRespData>("https://github.com/login/oauth/access_token", {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        code: credentials.code,
        redirect_uri: `${SITE_URL}/app-connections/github/oauth/callback`
      },
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "application/json"
      }
    });
  } catch (e: unknown) {
    throw new BadRequestError({
      message: `Unable to validate connection - verify credentials`
    });
  }

  if (tokenResp.status !== 200) {
    throw new BadRequestError({
      message: `Unable to validate credentials: GitHub responded with a status code of ${tokenResp.status} (${tokenResp.statusText}). Verify credentials and try again.`
    });
  }

  if (method === GitHubConnectionMethod.App) {
    const installationsResp = await request.get<{
      installations: {
        id: number;
        account: {
          login: string;
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
        // access token not needed for GitHub App
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
