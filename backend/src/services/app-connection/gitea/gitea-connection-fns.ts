import { AxiosResponse } from "axios";

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

export const getGiteaAPIBaseUrl = async (config: Pick<TGiteaConnectionConfig | TGiteaConnection, "credentials">) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return `${instanceUrl}/api/v1`;
};

export const validateGiteaConnectionCredentials = async (config: TGiteaConnectionConfig) => {
  const baseUrl = await getGiteaAPIBaseUrl(config);
  const { personalAccessToken } = config.credentials;

  try {
    await request.get(`${baseUrl}/user`, {
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

export const makePaginatedGiteaRequest = async <T>(appConnection: TGiteaConnection, path: string): Promise<T[]> => {
  const results: T[] = [];
  const itemsPerPage = 50;
  const maxIterations = 1000;

  const { credentials } = appConnection;

  const baseUrl = await getGiteaAPIBaseUrl(appConnection);
  const initialUrlObj = new URL(`${baseUrl}${path}`);
  initialUrlObj.searchParams.set("limit", itemsPerPage.toString());

  const firstResponse = await request.get<T[]>(initialUrlObj.toString(), {
    headers: {
      Authorization: `Bearer ${credentials.personalAccessToken}`,
      Accept: "application/json"
    }
  });

  const firstPageItems = firstResponse.data as unknown as T[];
  results.push(...firstPageItems);

  const totalItems = Number(String(firstResponse.headers["x-total-count"])) || 0;

  // More than one page of data available, so concurrently fetch the remaining pages
  if (totalItems > firstPageItems.length) {
    const pageRequests: Promise<AxiosResponse<T[]>>[] = [];
    const totalPages = Math.ceil((totalItems - firstPageItems.length) / itemsPerPage);

    for (let pageNum = 2; pageNum <= totalPages && pageNum - 1 < maxIterations; pageNum += 1) {
      const pageUrlObj = new URL(initialUrlObj.toString());
      pageUrlObj.searchParams.set("page", pageNum.toString());

      pageRequests.push(
        request.get<T[]>(pageUrlObj.toString(), {
          headers: {
            Authorization: `Bearer ${credentials.personalAccessToken}`,
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

export const listGiteaOrganizations = async (appConnection: TGiteaConnection): Promise<TGiteaOrganization[]> => {
  // const baseUrl = await getGiteaAPIBaseUrl(appConnection);
  // const { personalAccessToken } = appConnection.credentials;

  const data = await makePaginatedGiteaRequest<TGiteaListOrganizationsResponse[number]>(appConnection, "/user/orgs");

  // const { data } = await request.get<TGiteaListOrganizationsResponse>(`${baseUrl}/user/orgs`, {
  //   headers: {
  //     Authorization: `Bearer ${personalAccessToken}`,
  //     Accept: "application/json"
  //   }
  // });

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
  const baseUrl = await getGiteaAPIBaseUrl(appConnection);
  const { personalAccessToken } = appConnection.credentials;

  const { data } = await request.get<TGiteaListRepositoriesResponse>(`${baseUrl}/repos/search`, {
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
