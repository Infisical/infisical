/* eslint-disable no-await-in-loop */
import { GitbeakerRequestError, Gitlab } from "@gitbeaker/rest";
import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { GitLabAccessTokenType, GitLabConnectionMethod } from "./gitlab-connection-enums";
import { TGitLabConnection, TGitLabConnectionConfig, TGitLabGroup, TGitLabProject } from "./gitlab-connection-types";

interface GitLabOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  created_at: number;
  scope?: string;
}

export const getGitLabConnectionListItem = () => {
  const { INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID } = getConfig();

  return {
    name: "GitLab" as const,
    app: AppConnection.GitLab as const,
    methods: Object.values(GitLabConnectionMethod) as [
      GitLabConnectionMethod.AccessToken,
      GitLabConnectionMethod.OAuth
    ],
    oauthClientId: INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID
  };
};

export const getGitLabInstanceUrl = async (instanceUrl?: string) => {
  const gitLabInstanceUrl = instanceUrl ? removeTrailingSlash(instanceUrl) : IntegrationUrls.GITLAB_URL;

  await blockLocalAndPrivateIpAddresses(gitLabInstanceUrl);

  return gitLabInstanceUrl;
};

export const getGitLabClient = async (accessToken: string, instanceUrl?: string, isOAuth = false) => {
  const host = await getGitLabInstanceUrl(instanceUrl);

  const client = new Gitlab<true>({
    host,
    ...(isOAuth ? { oauthToken: accessToken } : { token: accessToken }),
    camelize: true
  });

  return client;
};

export const refreshGitLabToken = async (
  refreshToken: string,
  appId: string,
  orgId: string,
  projectId: string | undefined | null,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  instanceUrl?: string
): Promise<string> => {
  const { INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID, INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET, SITE_URL } =
    getConfig();
  if (!INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET || !INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID || !SITE_URL) {
    throw new InternalServerError({
      message: `GitLab environment variables have not been configured`
    });
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID,
    client_secret: INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET,
    redirect_uri: `${SITE_URL}/organization/app-connections/gitlab/oauth/callback`
  });

  try {
    const url = await getGitLabInstanceUrl(instanceUrl);
    const { data } = await request.post<GitLabOAuthTokenResponse>(`${url}/oauth/token`, payload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      }
    });

    const expiresAt = new Date(Date.now() + data.expires_in * 1000 - 600000);

    const encryptedCredentials = await encryptAppConnectionCredentials({
      credentials: {
        instanceUrl,
        tokenType: data.token_type,
        createdAt: new Date(data.created_at * 1000).toISOString(),
        refreshToken: data.refresh_token,
        accessToken: data.access_token,
        expiresAt
      },
      orgId,
      kmsService,
      projectId
    });

    await appConnectionDAL.updateById(appId, { encryptedCredentials });
    return data.access_token;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to refresh GitLab token: ${error.message}`
      });
    }
    throw new BadRequestError({
      message: "Unable to refresh GitLab token"
    });
  }
};

export const exchangeGitLabOAuthCode = async (
  code: string,
  instanceUrl?: string
): Promise<GitLabOAuthTokenResponse> => {
  const { INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID, INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET, SITE_URL } =
    getConfig();
  if (!INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET || !INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID || !SITE_URL) {
    throw new InternalServerError({
      message: `GitLab environment variables have not been configured`
    });
  }

  try {
    const payload = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID,
      client_secret: INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET,
      redirect_uri: `${SITE_URL}/organization/app-connections/gitlab/oauth/callback`
    });
    const url = await getGitLabInstanceUrl(instanceUrl);

    const response = await request.post<GitLabOAuthTokenResponse>(`${url}/oauth/token`, payload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      }
    });

    if (!response.data) {
      throw new InternalServerError({
        message: "Failed to exchange OAuth code: Empty response"
      });
    }

    return response.data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to exchange OAuth code: ${error.message}`
      });
    }
    throw new BadRequestError({
      message: "Unable to exchange OAuth code"
    });
  }
};

export const validateGitLabConnectionCredentials = async (config: TGitLabConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  let accessToken: string;
  let oauthData: GitLabOAuthTokenResponse | null = null;

  if (method === GitLabConnectionMethod.OAuth && "code" in inputCredentials) {
    oauthData = await exchangeGitLabOAuthCode(inputCredentials.code, inputCredentials.instanceUrl);
    accessToken = oauthData.access_token;
  } else if (method === GitLabConnectionMethod.AccessToken && "accessToken" in inputCredentials) {
    accessToken = inputCredentials.accessToken;
  } else {
    throw new BadRequestError({
      message: "Invalid credentials for the selected connection method"
    });
  }

  try {
    const client = await getGitLabClient(
      accessToken,
      inputCredentials.instanceUrl,
      method === GitLabConnectionMethod.OAuth
    );
    await client.Users.showCurrentUser();
  } catch (error: unknown) {
    logger.error(error, "Error validating GitLab connection credentials");

    if (error instanceof GitbeakerRequestError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
      });
    }

    throw new BadRequestError({
      message: `Failed to validate credentials: ${(error as Error)?.message || "verify credentials"}`
    });
  }

  if (method === GitLabConnectionMethod.OAuth && oauthData) {
    return {
      accessToken,
      instanceUrl: inputCredentials.instanceUrl,
      refreshToken: oauthData.refresh_token,
      expiresAt: new Date(Date.now() + oauthData.expires_in * 1000 - 60000),
      tokenType: oauthData.token_type,
      createdAt: new Date(oauthData.created_at * 1000)
    };
  }

  return inputCredentials;
};

export const getGitLabConnectionClient = async (
  appConnection: TGitLabConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  let { accessToken } = appConnection.credentials;

  if (
    appConnection.method === GitLabConnectionMethod.OAuth &&
    appConnection.credentials.refreshToken &&
    new Date(appConnection.credentials.expiresAt) < new Date()
  ) {
    accessToken = await refreshGitLabToken(
      appConnection.credentials.refreshToken,
      appConnection.id,
      appConnection.orgId,
      appConnection.projectId,
      appConnectionDAL,
      kmsService,
      appConnection.credentials.instanceUrl
    );
  }

  const client = await getGitLabClient(
    accessToken,
    appConnection.credentials.instanceUrl,
    appConnection.method === GitLabConnectionMethod.OAuth
  );

  return client;
};

export const listGitLabProjects = async ({
  appConnection,
  appConnectionDAL,
  kmsService
}: {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}): Promise<TGitLabProject[]> => {
  let { accessToken } = appConnection.credentials;

  if (
    appConnection.method === GitLabConnectionMethod.OAuth &&
    appConnection.credentials.refreshToken &&
    new Date(appConnection.credentials.expiresAt) < new Date()
  ) {
    accessToken = await refreshGitLabToken(
      appConnection.credentials.refreshToken,
      appConnection.id,
      appConnection.orgId,
      appConnection.projectId,
      appConnectionDAL,
      kmsService,
      appConnection.credentials.instanceUrl
    );
  }

  try {
    const client = await getGitLabClient(
      accessToken,
      appConnection.credentials.instanceUrl,
      appConnection.method === GitLabConnectionMethod.OAuth
    );
    const projects = await client.Projects.all({
      archived: false,
      includePendingDelete: false,
      membership: true,
      includeHidden: false,
      imported: false
    });

    return projects.map((project) => ({
      name: project.pathWithNamespace,
      id: project.id.toString()
    }));
  } catch (error: unknown) {
    if (error instanceof GitbeakerRequestError) {
      throw new BadRequestError({
        message: `Failed to fetch GitLab projects: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
      });
    }

    if (error instanceof InternalServerError) {
      throw error;
    }

    throw new InternalServerError({
      message: "Unable to fetch GitLab projects"
    });
  }
};

export const listGitLabGroups = async ({
  appConnection,
  appConnectionDAL,
  kmsService
}: {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}): Promise<TGitLabGroup[]> => {
  let { accessToken } = appConnection.credentials;

  if (
    appConnection.method === GitLabConnectionMethod.AccessToken &&
    appConnection.credentials.accessTokenType === GitLabAccessTokenType.Project
  ) {
    return [];
  }

  if (
    appConnection.method === GitLabConnectionMethod.OAuth &&
    appConnection.credentials.refreshToken &&
    new Date(appConnection.credentials.expiresAt) < new Date()
  ) {
    accessToken = await refreshGitLabToken(
      appConnection.credentials.refreshToken,
      appConnection.id,
      appConnection.orgId,
      appConnection.projectId,
      appConnectionDAL,
      kmsService,
      appConnection.credentials.instanceUrl
    );
  }

  try {
    const client = await getGitLabClient(
      accessToken,
      appConnection.credentials.instanceUrl,
      appConnection.method === GitLabConnectionMethod.OAuth
    );

    const groups = await client.Groups.all({
      orderBy: "name",
      sort: "asc",
      minAccessLevel: 50
    });

    return groups.map((group) => ({
      id: group.id.toString(),
      fullName: group.fullName
    }));
  } catch (error: unknown) {
    if (error instanceof GitbeakerRequestError) {
      throw new BadRequestError({
        message: `Failed to fetch GitLab groups: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
      });
    }

    if (error instanceof InternalServerError) {
      throw error;
    }

    throw new InternalServerError({
      message: "Unable to fetch GitLab groups"
    });
  }
};
