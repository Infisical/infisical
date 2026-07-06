import { AxiosError, AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { encryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { AppConnection } from "../app-connection-enums";
import { GiteaConnectionMethod } from "./gitea-connection-enums";
import {
  TGiteaAccessToken,
  TGiteaConnection,
  TGiteaConnectionConfig,
  TGiteaOrganization,
  TGiteaRepository
} from "./gitea-connection-types";

type TGiteaOAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
};

type TGiteaListOrganizationsResponse = {
  id: number;
  name: string;
  full_name: string;
}[];

type TGiteaListRepositoriesResponse = {
  data: {
    id: number;
    name: string;
    owner: {
      login: string;
    };
  }[];
};

const getOAuthConfig = () => {
  const { INF_APP_CONNECTION_GITEA_OAUTH_CLIENT_ID, INF_APP_CONNECTION_GITEA_OAUTH_CLIENT_SECRET, SITE_URL, isCloud } =
    getConfig();

  if (
    !INF_APP_CONNECTION_GITEA_OAUTH_CLIENT_ID ||
    !INF_APP_CONNECTION_GITEA_OAUTH_CLIENT_SECRET ||
    !SITE_URL ||
    isCloud
  ) {
    throw new InternalServerError({
      message: `Gitea environment variables have not been configured`
    });
  }

  return {
    clientId: INF_APP_CONNECTION_GITEA_OAUTH_CLIENT_ID,
    clientSecret: INF_APP_CONNECTION_GITEA_OAUTH_CLIENT_SECRET,
    siteUrl: SITE_URL
  };
};

export const getGiteaConnectionListItem = () => {
  let oauthClientId: string | undefined;

  try {
    const config = getOAuthConfig();
    oauthClientId = config.clientId;
  } catch {
    // Suppress static config fetch errors
    // It likely means it isn't configured, rather than misconfiguration
  }

  return {
    name: "Gitea" as const,
    app: AppConnection.Gitea as const,
    methods: Object.values(GiteaConnectionMethod) as [
      GiteaConnectionMethod.OAuth,
      GiteaConnectionMethod.PersonalAccessToken
    ],
    oauthClientId
  };
};

export const getGiteaInstanceUrl = async (instanceUrl: string) => {
  const normalizaedInstanceUrl = removeTrailingSlash(instanceUrl);
  await blockLocalAndPrivateIpAddresses(normalizaedInstanceUrl);
  return normalizaedInstanceUrl;
};

export const getGiteaAPIBaseUrl = async (config: Pick<TGiteaConnectionConfig | TGiteaConnection, "credentials">) => {
  const instanceUrl = await getGiteaInstanceUrl(config.credentials.instanceUrl);
  return `${instanceUrl}/api/v1`;
};

const exchangeGiteaOAuthCode = async (code: string, instanceUrl: string): Promise<TGiteaOAuthTokenResponse> => {
  const { clientId, clientSecret, siteUrl } = getOAuthConfig();

  try {
    const url = await getGiteaInstanceUrl(instanceUrl);
    const payload = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${siteUrl}/organization/app-connections/gitea/oauth/callback`
    });

    const response = await request.post<TGiteaOAuthTokenResponse>(
      `${url}/login/oauth/access_token`,
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        }
      }
    );

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

const refreshGiteaOAuthAccessToken = async ({
  instanceUrl,
  refreshToken,
  appConnectionId,
  orgId,
  projectId,
  appConnectionDAL,
  kmsService
}: {
  instanceUrl: string;
  refreshToken: string;
  appConnectionId: string;
  orgId: string;
  projectId: string | undefined | null;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { clientId, clientSecret, siteUrl } = getOAuthConfig();

  try {
    const url = await getGiteaInstanceUrl(instanceUrl);
    const payload = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${siteUrl}/organization/app-connections/gitea/oauth/callback`
    });

    const { data } = await request.post<TGiteaOAuthTokenResponse>(
      `${url}/login/oauth/access_token`,
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        }
      }
    );

    if (!data) {
      throw new InternalServerError({
        message: "Failed to exchange OAuth code: Empty response"
      });
    }

    const encryptedCredentials = await encryptAppConnectionCredentials({
      credentials: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000 - 60000),
        tokenType: data.token_type,
        instanceUrl
      },
      orgId,
      kmsService,
      projectId
    });

    await appConnectionDAL.updateById(appConnectionId, { encryptedCredentials });
    return data.access_token;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to refresh Gitea token: ${error.message}`
      });
    }
    throw new BadRequestError({
      message: "Unable to refresh Gitea token"
    });
  }
};

export const getValidAccessToken = async ({
  appConnection,
  appConnectionDAL,
  kmsService
}: {
  appConnection: TGiteaConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}): Promise<TGiteaAccessToken> => {
  if (appConnection.method === GiteaConnectionMethod.PersonalAccessToken) {
    return { prefix: "token", value: appConnection.credentials.personalAccessToken };
  }

  let { accessToken } = appConnection.credentials;

  if (new Date(appConnection.credentials.expiresAt) < new Date()) {
    accessToken = await refreshGiteaOAuthAccessToken({
      instanceUrl: appConnection.credentials.instanceUrl,
      refreshToken: appConnection.credentials.refreshToken,
      appConnectionId: appConnection.id,
      orgId: appConnection.orgId,
      projectId: appConnection.projectId,
      appConnectionDAL,
      kmsService
    });
  }

  return { prefix: "Bearer", value: accessToken };
};

export const validateGiteaConnectionCredentials = async (config: TGiteaConnectionConfig) => {
  const baseUrl = await getGiteaAPIBaseUrl(config);
  const { credentials: ogCredentials, method } = config;

  let accessToken: string;
  let oauthData: TGiteaOAuthTokenResponse | null = null;

  if (method === GiteaConnectionMethod.OAuth && "code" in ogCredentials) {
    oauthData = await exchangeGiteaOAuthCode(ogCredentials.code, ogCredentials.instanceUrl);
    accessToken = oauthData.access_token;
  } else if (method === GiteaConnectionMethod.PersonalAccessToken && "personalAccessToken" in ogCredentials) {
    accessToken = ogCredentials.personalAccessToken;
  } else {
    throw new BadRequestError({
      message: "Invalid credentials for the selected connection method"
    });
  }

  try {
    await request.get(`${baseUrl}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Failed to validate credentials: ${(error as Error)?.message || "verify credentials"}`
    });
  }

  if (method === GiteaConnectionMethod.OAuth && oauthData) {
    return {
      accessToken,
      refreshToken: oauthData.refresh_token,
      expiresAt: new Date(Date.now() + oauthData.expires_in * 1000 - 60000),
      tokenType: oauthData.token_type,
      instanceUrl: ogCredentials.instanceUrl
    };
  }

  return ogCredentials;
};

export const makePaginatedGiteaRequest = async <T>({
  url,
  accessToken
}: {
  url: string;
  accessToken: TGiteaAccessToken;
}): Promise<T[]> => {
  const results: T[] = [];
  const itemsPerPage = 50;
  const maxIterations = 1000;

  const initialUrlObj = new URL(url);
  initialUrlObj.searchParams.set("limit", itemsPerPage.toString());

  const firstResponse = await request.get<T[]>(initialUrlObj.toString(), {
    headers: {
      Authorization: `${accessToken.prefix} ${accessToken.value}`,
      Accept: "application/json"
    }
  });

  const firstPageItems = firstResponse.data as unknown as T[];
  results.push(...firstPageItems);

  const totalItems = Number(String(firstResponse.headers["x-total-count"])) || 0;

  // More than one page of data available, so concurrently fetch the remaining pages
  if (totalItems > firstPageItems.length) {
    const pageRequests: Promise<AxiosResponse<T[]>>[] = [];
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    for (let pageNum = 2; pageNum <= totalPages && pageNum - 1 < maxIterations; pageNum += 1) {
      const pageUrlObj = new URL(initialUrlObj.toString());
      pageUrlObj.searchParams.set("page", pageNum.toString());

      pageRequests.push(
        request.get<T[]>(pageUrlObj.toString(), {
          headers: {
            Authorization: `${accessToken.prefix} ${accessToken.value}`,
            Accept: "application/json"
          }
        })
      );
    }

    const responses = await Promise.all(pageRequests);

    for (const response of responses) {
      const items = response.data as unknown as T[];
      results.push(...items);
    }
  }

  return results;
};

export const listGiteaOrganizations = async ({
  appConnection,
  appConnectionDAL,
  kmsService
}: {
  appConnection: TGiteaConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}): Promise<TGiteaOrganization[]> => {
  const baseUrl = await getGiteaAPIBaseUrl(appConnection);
  const accessToken = await getValidAccessToken({ appConnection, appConnectionDAL, kmsService });

  const data = await makePaginatedGiteaRequest<TGiteaListOrganizationsResponse[number]>({
    url: `${baseUrl}/user/orgs`,
    accessToken
  });

  return data.map((org) => ({
    id: org.id.toString(),
    name: org.name,
    fullName: org.full_name
  }));
};

export const listGiteaRepositories = async ({
  appConnection,
  appConnectionDAL,
  kmsService,
  search,
  limit
}: {
  appConnection: TGiteaConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  search?: string;
  limit?: number;
}): Promise<TGiteaRepository[]> => {
  const baseUrl = await getGiteaAPIBaseUrl(appConnection);
  const accessToken = await getValidAccessToken({ appConnection, appConnectionDAL, kmsService });

  const { data } = await request.get<TGiteaListRepositoriesResponse>(`${baseUrl}/repos/search`, {
    headers: {
      Authorization: `${accessToken.prefix} ${accessToken.value}`,
      Accept: "application/json"
    },
    params: {
      q: search,
      limit
    }
  });

  return data.data.map((repo) => ({
    id: repo.id.toString(),
    name: repo.name,
    owner: {
      name: repo.owner.login
    }
  }));
};
