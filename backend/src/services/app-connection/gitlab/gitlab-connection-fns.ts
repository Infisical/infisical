/* eslint-disable no-await-in-loop */
import { GitbeakerRequestError, GitbeakerRetryError, Gitlab } from "@gitbeaker/rest";
import { AxiosError, HttpStatusCode } from "axios";

import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError, RateLimitError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses, safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { GitLabAccessTokenType, GitLabConnectionMethod } from "./gitlab-connection-enums";
import {
  TGitLabConnection,
  TGitLabConnectionConfig,
  TGitLabGroup,
  TGitLabProject,
  TGitLabServiceAccount
} from "./gitlab-connection-types";

interface GitLabOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  created_at: number;
  scope?: string;
}

type TNavigationParams = {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
};

export const getGitLabConnectionListItem = ({
  INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID
}: {
  INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID?: string;
}) => {
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
  kmsDataKeyService: TKmsDataKeyService,
  instanceConfigService: TInstanceConfigService,
  instanceUrl?: string
): Promise<string> => {
  const { INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID, INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET } =
    await instanceConfigService.getOverridableEnv();
  const { SITE_URL, isCloud } = getConfig();
  if (
    !INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET ||
    !INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID ||
    !SITE_URL ||
    // Cloud instances do not support OAuth authentication
    isCloud
  ) {
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
    const { data } = await safeRequest.post<GitLabOAuthTokenResponse>(`${url}/oauth/token`, payload.toString(), {
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
      kmsDataKeyService,
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

const getNavigationClient = async ({
  appConnection,
  appConnectionDAL,
  kmsDataKeyService,
  instanceConfigService
}: TNavigationParams) => {
  let { accessToken } = appConnection.credentials;

  if (
    appConnection.method === GitLabConnectionMethod.AccessToken &&
    appConnection.credentials.accessTokenType === GitLabAccessTokenType.Project
  ) {
    return null;
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
      kmsDataKeyService,
      instanceConfigService,
      appConnection.credentials.instanceUrl
    );
  }

  return getGitLabClient(
    accessToken,
    appConnection.credentials.instanceUrl,
    appConnection.method === GitLabConnectionMethod.OAuth
  );
};

export const exchangeGitLabOAuthCode = async (
  code: string,
  instanceConfigService: TInstanceConfigService,
  instanceUrl?: string
): Promise<GitLabOAuthTokenResponse> => {
  const { INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID, INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET } =
    await instanceConfigService.getOverridableEnv();
  const { SITE_URL, isCloud } = getConfig();
  if (
    !INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET ||
    !INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID ||
    !SITE_URL ||
    isCloud
  ) {
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

    const response = await safeRequest.post<GitLabOAuthTokenResponse>(`${url}/oauth/token`, payload.toString(), {
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

export const validateGitLabConnectionCredentials = async (
  config: TGitLabConnectionConfig,
  instanceConfigService: TInstanceConfigService
) => {
  const { credentials: inputCredentials, method } = config;

  let accessToken: string;
  let oauthData: GitLabOAuthTokenResponse | null = null;

  if (method === GitLabConnectionMethod.OAuth && "code" in inputCredentials) {
    oauthData = await exchangeGitLabOAuthCode(
      inputCredentials.code,
      instanceConfigService,
      inputCredentials.instanceUrl
    );
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
  kmsDataKeyService: TKmsDataKeyService,
  instanceConfigService: TInstanceConfigService
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
      kmsDataKeyService,
      instanceConfigService,
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

const throwGitLabListError = (error: unknown, resource: "groups" | "projects"): never => {
  // Gitbeaker retries 429 responses and exposes the final status only in the retry error's message.
  const isRateLimited =
    (error instanceof GitbeakerRequestError && error.cause?.response.status === HttpStatusCode.TooManyRequests) ||
    (error instanceof GitbeakerRetryError && /last status code: 429\b/.test(error.message));

  if (isRateLimited) {
    throw new RateLimitError({
      message: `GitLab rate limit reached while loading ${resource}. Wait a moment and try again.`
    });
  }

  if (error instanceof GitbeakerRequestError) {
    throw new BadRequestError({
      message: `Failed to fetch GitLab ${resource}: ${error.message ?? "Unknown error"}${error.cause?.description && error.message !== "Unauthorized" ? `. Cause: ${error.cause.description}` : ""}`
    });
  }

  if (error instanceof InternalServerError) {
    throw error;
  }

  throw new InternalServerError({
    message: `Unable to fetch GitLab ${resource}`
  });
};

export const listGitLabProjects = async ({
  appConnection,
  appConnectionDAL,
  kmsDataKeyService,
  instanceConfigService,
  search,
  limit
}: {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  search?: string;
  limit?: number;
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
      kmsDataKeyService,
      instanceConfigService,
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
      pagination: "offset",
      ...(limit !== undefined ? { perPage: limit } : {}),
      ...(search ? { search } : {}),
      maxPages: 1,
      archived: false,
      includePendingDelete: false,
      membership: true,
      includeHidden: false,
      imported: false,
      searchNamespaces: !!search
    });

    return projects.map((project) => ({
      name: project.pathWithNamespace,
      id: project.id.toString()
    }));
  } catch (error: unknown) {
    return throwGitLabListError(error, "projects");
  }
};

export const listGitLabGroups = async ({
  appConnection,
  appConnectionDAL,
  kmsDataKeyService,
  instanceConfigService,
  search,
  limit
}: {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  search?: string;
  limit?: number;
}): Promise<TGitLabGroup[]> => {
  const client = await getNavigationClient({
    appConnection,
    appConnectionDAL,
    kmsDataKeyService,
    instanceConfigService
  });
  if (!client) return [];

  try {
    const groups = await client.Groups.all({
      pagination: "offset",
      ...(limit !== undefined ? { perPage: limit } : {}),
      maxPages: 1,
      orderBy: "name",
      sort: "asc",
      minAccessLevel: 50,
      ...(search ? { search } : {})
    });

    return groups.map((group) => ({
      id: group.id.toString(),
      name: group.name,
      fullName: group.fullName,
      fullPath: group.fullPath
    }));
  } catch (error: unknown) {
    return throwGitLabListError(error, "groups");
  }
};

export const getGitLabConnectionAccessToken = async (
  appConnection: TGitLabConnection,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsDataKeyService: TKmsDataKeyService,
  instanceConfigService: TInstanceConfigService
) => {
  if (
    appConnection.method === GitLabConnectionMethod.OAuth &&
    appConnection.credentials.refreshToken &&
    new Date(appConnection.credentials.expiresAt) < new Date()
  ) {
    return refreshGitLabToken(
      appConnection.credentials.refreshToken,
      appConnection.id,
      appConnection.orgId,
      appConnection.projectId,
      appConnectionDAL,
      kmsDataKeyService,
      instanceConfigService,
      appConnection.credentials.instanceUrl
    );
  }

  return appConnection.credentials.accessToken;
};

export const getGitLabAuthHeaders = (method: GitLabConnectionMethod, accessToken: string): Record<string, string> =>
  method === GitLabConnectionMethod.OAuth
    ? { Authorization: `Bearer ${accessToken}` }
    : { "PRIVATE-TOKEN": accessToken };

export const getGitLabErrorMessage = (error: unknown) => {
  if (!(error instanceof AxiosError)) return (error as Error)?.message || "Unknown error";

  const data = error.response?.data as { message?: unknown; error?: unknown; error_description?: unknown } | undefined;

  if (typeof data?.message === "string") return data.message;

  // validation failures come back as { message: { field: ["reason", ...] } }
  if (data?.message && typeof data.message === "object") {
    return Object.entries(data.message as Record<string, unknown>)
      .map(([field, reasons]) => `${field} ${Array.isArray(reasons) ? reasons.join(", ") : String(reasons)}`)
      .join("; ");
  }

  if (typeof data?.error_description === "string") return data.error_description;
  if (typeof data?.error === "string") return data.error;

  return error.response?.status ? `GitLab responded with status ${error.response.status}` : error.message;
};

export const getGitLabCurrentUserId = async ({
  apiUrl,
  headers
}: {
  apiUrl: string;
  headers: Record<string, string>;
}) => {
  const { data } = await safeRequest.get<{ id: number }>(`${apiUrl}/user`, { headers });

  return data.id.toString();
};

const GITLAB_SERVICE_ACCOUNTS_PAGE_SIZE = 100;
const GITLAB_SERVICE_ACCOUNTS_MAX_PAGES = 50;

export const listGitLabGroupServiceAccounts = async ({
  appConnection,
  appConnectionDAL,
  kmsDataKeyService,
  instanceConfigService,
  groupId
}: {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  groupId: string;
}): Promise<TGitLabServiceAccount[]> => {
  const accessToken = await getGitLabConnectionAccessToken(
    appConnection,
    appConnectionDAL,
    kmsDataKeyService,
    instanceConfigService
  );
  const instanceUrl = await getGitLabInstanceUrl(appConnection.credentials.instanceUrl);

  const apiUrl = `${instanceUrl}/api/v4`;
  const headers = getGitLabAuthHeaders(appConnection.method, accessToken);
  const serviceAccounts: TGitLabServiceAccount[] = [];

  try {
    // a rotation can't target the connection's own identity, so it isn't offered
    const connectionUserId = await getGitLabCurrentUserId({ apiUrl, headers });

    let page = 1;
    for (let pagesRead = 0; pagesRead < GITLAB_SERVICE_ACCOUNTS_MAX_PAGES; pagesRead += 1) {
      const { data, headers: responseHeaders } = await safeRequest.get<
        { id: number; username: string; name: string }[]
      >(`${apiUrl}/groups/${encodeURIComponent(groupId)}/service_accounts`, {
        headers,
        params: { page, per_page: GITLAB_SERVICE_ACCOUNTS_PAGE_SIZE, order_by: "username", sort: "asc" }
      });

      serviceAccounts.push(
        ...data
          .filter((serviceAccount) => serviceAccount.id.toString() !== connectionUserId)
          .map((serviceAccount) => ({
            id: serviceAccount.id.toString(),
            username: serviceAccount.username,
            name: serviceAccount.name
          }))
      );

      // GitLab leaves x-next-page empty on the last page
      const nextPage = Number(responseHeaders["x-next-page"]);
      if (!nextPage) return serviceAccounts;
      page = nextPage;
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === HttpStatusCode.TooManyRequests) {
      throw new RateLimitError({
        message: "GitLab rate limit reached while loading service accounts. Wait a moment and try again."
      });
    }

    if (error instanceof AxiosError && error.response?.status === HttpStatusCode.Forbidden) {
      throw new BadRequestError({
        message: `The GitLab connection cannot list the service accounts of group '${groupId}'. The connection's user needs the Owner role on the group.`
      });
    }

    throw new BadRequestError({
      message: `Failed to list the service accounts of GitLab group '${groupId}': ${getGitLabErrorMessage(error)}`
    });
  }

  logger.warn(
    `listGitLabGroupServiceAccounts: stopped after ${GITLAB_SERVICE_ACCOUNTS_MAX_PAGES} pages [connectionId=${appConnection.id}] [groupId=${groupId}]`
  );

  return serviceAccounts;
};
