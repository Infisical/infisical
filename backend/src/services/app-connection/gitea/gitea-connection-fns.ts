import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { GiteaConnectionMethod } from "./gitea-connection-enums";
import {
  TGiteaConnection,
  TGiteaConnectionConfig,
  TGiteaOrganization,
  TGiteaRepository
} from "./gitea-connection-types";

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

export const getGiteaConnectionListItem = () => {
  return {
    name: "Gitea" as const,
    app: AppConnection.Gitea as const,
    methods: Object.values(GiteaConnectionMethod) as [GiteaConnectionMethod.PersonalAccessToken]
  };
};

export const getGiteaInstanceUrl = async (config: Pick<TGiteaConnectionConfig | TGiteaConnection, "credentials">) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const validateGiteaConnectionCredentials = async (config: TGiteaConnectionConfig) => {
  const instanceUrl = await getGiteaInstanceUrl(config);
  const { personalAccessToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/api/v1/user`, {
      headers: {
        Authorization: `Bearer ${personalAccessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Failed to validate credentials: ${(error as Error)?.message || "verify credentials"}`
    });
  }

  return config.credentials;
};

export const listGiteaOrganizations = async (appConnection: TGiteaConnection): Promise<TGiteaOrganization[]> => {
  const instanceUrl = await getGiteaInstanceUrl(appConnection);
  const { personalAccessToken } = appConnection.credentials;

  const { data } = await request.get<TGiteaListOrganizationsResponse>(`${instanceUrl}/api/v1/user/orgs`, {
    headers: {
      Authorization: `Bearer ${personalAccessToken}`,
      Accept: "application/json"
    }
  });

  return data.map((org) => ({
    id: org.id.toString(),
    name: org.name,
    fullName: org.full_name
  }));
};

export const listGiteaRepositories = async (
  appConnection: TGiteaConnection,
  search?: string,
  limit?: number
): Promise<TGiteaRepository[]> => {
  const instanceUrl = await getGiteaInstanceUrl(appConnection);
  const { personalAccessToken } = appConnection.credentials;

  const { data } = await request.get<TGiteaListRepositoriesResponse>(`${instanceUrl}/api/v1/repos/search`, {
    headers: {
      Authorization: `Bearer ${personalAccessToken}`,
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
