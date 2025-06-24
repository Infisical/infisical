/* eslint-disable no-await-in-loop */
import { AxiosError, AxiosResponse } from "axios";

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
import { GitLabConnectionMethod } from "./gitlab-connection-enums";
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
  const { CLIENT_ID_GITLAB_LOGIN } = getConfig();

  return {
    name: "GitLab" as const,
    app: AppConnection.GitLab as const,
    methods: Object.values(GitLabConnectionMethod) as [
      GitLabConnectionMethod.AccessToken,
      GitLabConnectionMethod.OAuth
    ],
    oauthClientId: CLIENT_ID_GITLAB_LOGIN
  };
};

export const getGitLabInstanceUrl = async (instanceUrl?: string) => {
  const gitLabInstanceUrl = instanceUrl ? removeTrailingSlash(instanceUrl) : IntegrationUrls.GITLAB_URL;

  await blockLocalAndPrivateIpAddresses(gitLabInstanceUrl);

  return gitLabInstanceUrl;
};

export const refreshGitLabToken = async (
  refreshToken: string,
  appId: string,
  orgId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  instanceUrl?: string
): Promise<string> => {
  const { CLIENT_ID_GITLAB_LOGIN, CLIENT_SECRET_GITLAB_LOGIN, SITE_URL } = getConfig();
  if (!CLIENT_SECRET_GITLAB_LOGIN || !CLIENT_ID_GITLAB_LOGIN || !SITE_URL) {
    throw new InternalServerError({
      message: `GitLab environment variables have not been configured`
    });
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID_GITLAB_LOGIN,
    client_secret: CLIENT_SECRET_GITLAB_LOGIN,
    redirect_uri: `${SITE_URL}/integrations/gitlab/oauth2/callback`
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
      kmsService
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
  const { CLIENT_ID_GITLAB_LOGIN, CLIENT_SECRET_GITLAB_LOGIN, SITE_URL } = getConfig();
  if (!CLIENT_SECRET_GITLAB_LOGIN || !CLIENT_ID_GITLAB_LOGIN || !SITE_URL) {
    throw new InternalServerError({
      message: `GitLab environment variables have not been configured`
    });
  }

  try {
    const payload = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID_GITLAB_LOGIN,
      client_secret: CLIENT_SECRET_GITLAB_LOGIN,
      redirect_uri: `${SITE_URL}/integrations/gitlab/oauth2/callback`
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

  let response: AxiosResponse<TGitLabProject[]> | null = null;

  try {
    const url = await getGitLabInstanceUrl(inputCredentials.instanceUrl);
    response = await request.get<TGitLabProject[]>(`${url}/api/v4/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  if (!response?.data) {
    throw new InternalServerError({
      message: "Failed to validate credentials: Response was empty"
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

export const listGitLabProjects = async ({
  appConnection,
  appConnectionDAL,
  kmsService,
  teamId
}: {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  teamId?: string;
}): Promise<TGitLabProject[]> => {
  let { accessToken } = appConnection.credentials;

  if (
    appConnection.method === GitLabConnectionMethod.OAuth &&
    appConnection.credentials.refreshToken &&
    appConnection.credentials.expiresAt < new Date()
  ) {
    accessToken = await refreshGitLabToken(
      appConnection.credentials.refreshToken,
      appConnection.id,
      appConnection.orgId,
      appConnectionDAL,
      kmsService,
      appConnection.credentials.instanceUrl
    );
  }

  const url = await getGitLabInstanceUrl(appConnection.credentials.instanceUrl);
  const gitLabApiUrl = `${url}/api/v4`;

  const projects: TGitLabProject[] = [];
  let page = 1;
  const perPage = 100;
  let hasMorePages = true;

  try {
    if (teamId) {
      while (hasMorePages) {
        const { data } = await request.get<TGitLabProject[]>(`${gitLabApiUrl}/groups/${teamId}/projects`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          },
          params: {
            page: page.toString(),
            per_page: perPage.toString(),
            order_by: "updated_at",
            sort: "desc",
            include_subgroups: "true"
          }
        });

        if (!data) {
          throw new InternalServerError({
            message: "Failed to get group projects: Response was empty"
          });
        }

        data.forEach((project) => {
          projects.push({
            name: project.name,
            id: project.id.toString()
          });
        });

        hasMorePages = data.length === perPage;
        page += 1;
      }
    } else {
      const { data: userData } = await request.get<{ id: string }>(`${gitLabApiUrl}/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });

      if (!userData?.id) {
        throw new InternalServerError({
          message: "Failed to get current user information"
        });
      }

      while (hasMorePages) {
        const { data } = await request.get<TGitLabProject[]>(`${gitLabApiUrl}/users/${userData.id}/projects`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          },
          params: {
            page: page.toString(),
            per_page: perPage.toString(),
            order_by: "updated_at",
            sort: "desc"
          }
        });

        if (!data) {
          throw new InternalServerError({
            message: "Failed to get user projects: Response was empty"
          });
        }

        data.forEach((project) => {
          projects.push({
            name: project.name,
            id: project.id.toString()
          });
        });

        hasMorePages = data.length === perPage;
        page += 1;
      }

      if (projects.length === 0 && appConnection.method === GitLabConnectionMethod.AccessToken) {
        try {
          const { data: tokenAssociations } = await request.get<{
            projects?: TGitLabProject[];
            groups?: Array<{ projects?: TGitLabProject[] }>;
          }>(`${gitLabApiUrl}/personal_access_tokens/self/associations`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            },
            params: {
              min_access_level: "50"
            }
          });

          if (tokenAssociations?.projects) {
            tokenAssociations.projects.forEach((project) => {
              projects.push({
                name: project.name,
                id: project.id.toString()
              });
            });
          }

          if (tokenAssociations?.groups) {
            tokenAssociations.groups.forEach((group) => {
              if (group.projects) {
                group.projects.forEach((project) => {
                  const existingProject = projects.find((p) => p.id === project.id.toString());
                  if (!existingProject) {
                    projects.push({
                      name: project.name,
                      id: project.id.toString()
                    });
                  }
                });
              }
            });
          }
        } catch (error) {
          logger.warn(error, "Failed to fetch projects via personal access token associations:");
        }
      }
    }

    return projects;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const { message } = error;

      if (status === 401) {
        throw new BadRequestError({
          message: `GitLab authentication failed: ${message}`
        });
      } else if (status === 403) {
        throw new BadRequestError({
          message: `GitLab access forbidden: ${message}`
        });
      } else if (status === 404) {
        throw new BadRequestError({
          message: teamId ? `GitLab group not found or access denied: ${message}` : `GitLab user not found: ${message}`
        });
      } else {
        throw new BadRequestError({
          message: `Failed to fetch GitLab projects: ${message}`
        });
      }
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
  kmsService,
  includeSubgroups = true,
  owned = false
}: {
  appConnection: TGitLabConnection;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  includeSubgroups?: boolean;
  owned?: boolean;
}): Promise<TGitLabGroup[]> => {
  let { accessToken } = appConnection.credentials;

  if (
    appConnection.method === GitLabConnectionMethod.OAuth &&
    appConnection.credentials.refreshToken &&
    appConnection.credentials.expiresAt < new Date()
  ) {
    accessToken = await refreshGitLabToken(
      appConnection.credentials.refreshToken,
      appConnection.id,
      appConnection.orgId,
      appConnectionDAL,
      kmsService,
      appConnection.credentials.instanceUrl
    );
  }

  const url = await getGitLabInstanceUrl(appConnection.credentials.instanceUrl);
  const gitLabApiUrl = `${url}/api/v4`;

  const groups: TGitLabGroup[] = [];
  let page = 1;
  const perPage = 100;
  let hasMorePages = true;

  try {
    while (hasMorePages) {
      const { data } = await request.get<TGitLabGroup[]>(`${gitLabApiUrl}/groups`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        },
        params: {
          page: page.toString(),
          per_page: perPage.toString(),
          order_by: "name",
          sort: "asc",
          all_available: (!owned).toString(),
          owned: owned.toString(),
          min_access_level: "10",
          ...(includeSubgroups && { with_custom_attributes: "true" })
        }
      });

      if (!data) {
        throw new InternalServerError({
          message: "Failed to get groups: Response was empty"
        });
      }

      data.forEach((group) => {
        groups.push({
          id: group.id.toString(),
          name: group.name
        });
      });

      hasMorePages = data.length === perPage;
      page += 1;
    }

    return groups;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const { message } = error;

      if (status === 401) {
        throw new BadRequestError({
          message: `GitLab authentication failed: ${message}`
        });
      } else if (status === 403) {
        throw new BadRequestError({
          message: `GitLab access forbidden: ${message}`
        });
      } else {
        throw new BadRequestError({
          message: `Failed to fetch GitLab groups: ${message}`
        });
      }
    }

    if (error instanceof InternalServerError) {
      throw error;
    }

    throw new InternalServerError({
      message: "Unable to fetch GitLab groups"
    });
  }
};
