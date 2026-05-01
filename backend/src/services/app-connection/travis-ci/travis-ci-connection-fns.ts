import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { TravisCIConnectionMethod } from "./travis-ci-connection-enums";
import {
  TravisCIBranch,
  TravisCIRepository,
  TTravisCIConnection,
  TTravisCIConnectionConfig
} from "./travis-ci-connection-types";

const travisCIApiHeaders = (apiToken: string) => ({
  Authorization: `token ${apiToken}`,
  "Travis-API-Version": "3",
  Accept: "application/json"
});

type TravisCIPaginationMeta = {
  is_last?: boolean;
  next?: { "@href": string } | null;
};

const resolveNextTravisCIUrl = (pagination: TravisCIPaginationMeta | undefined): string | undefined => {
  const nextHref = pagination?.next?.["@href"];
  if (pagination?.is_last || !nextHref) return undefined;
  return nextHref.startsWith("http") ? nextHref : `${IntegrationUrls.TRAVISCI_API_URL}${nextHref}`;
};

export const getTravisCIConnectionListItem = () => {
  return {
    name: "Travis CI" as const,
    app: AppConnection.TravisCI as const,
    methods: Object.values(TravisCIConnectionMethod) as [TravisCIConnectionMethod.ApiToken]
  };
};

export const validateTravisCIConnectionCredentials = async (config: TTravisCIConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.get(`${IntegrationUrls.TRAVISCI_API_URL}/user`, {
      headers: travisCIApiHeaders(inputCredentials.apiToken)
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${
          error.response?.data ? JSON.stringify(error.response?.data) : error.message || "Unknown error"
        }`
      });
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error).message || "Verify credentials"}`
    });
  }

  return inputCredentials;
};

export const listTravisCIRepositories = async (appConnection: TTravisCIConnection): Promise<TravisCIRepository[]> => {
  const {
    credentials: { apiToken }
  } = appConnection;

  try {
    type TravisCIRepositoriesResponse = {
      "@pagination"?: TravisCIPaginationMeta;
      repositories?: { id: string | number; slug: string }[];
    };

    const allRepos: { id: string | number; slug: string }[] = [];
    let nextUrl: string | undefined = `${IntegrationUrls.TRAVISCI_API_URL}/repos`;

    while (nextUrl) {
      // eslint-disable-next-line no-await-in-loop
      const { data }: { data: TravisCIRepositoriesResponse } = await request.get(nextUrl, {
        headers: travisCIApiHeaders(apiToken)
      });

      if (Array.isArray(data.repositories)) {
        allRepos.push(...data.repositories);
      }

      nextUrl = resolveNextTravisCIUrl(data["@pagination"]);
    }

    return allRepos.map((repo) => ({
      id: String(repo.id),
      slug: repo.slug,
      name: repo.slug?.split("/")[1] ?? repo.slug
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to fetch Travis CI repositories: ${
          error.response?.data ? JSON.stringify(error.response?.data) : error.message || "Unknown error"
        }`
      });
    }
    throw error;
  }
};

export const listTravisCIBranches = async (
  appConnection: TTravisCIConnection,
  repositoryId: string
): Promise<TravisCIBranch[]> => {
  const {
    credentials: { apiToken }
  } = appConnection;

  try {
    type TravisCIBranchesResponse = {
      "@pagination"?: TravisCIPaginationMeta;
      branches?: { name: string; default_branch?: boolean }[];
    };

    const allBranches: { name: string; default_branch?: boolean }[] = [];
    let nextUrl: string | undefined =
      `${IntegrationUrls.TRAVISCI_API_URL}/repo/${encodeURIComponent(repositoryId)}/branches`;

    while (nextUrl) {
      // eslint-disable-next-line no-await-in-loop
      const { data }: { data: TravisCIBranchesResponse } = await request.get(nextUrl, {
        headers: travisCIApiHeaders(apiToken)
      });

      if (Array.isArray(data.branches)) {
        allBranches.push(...data.branches);
      }

      nextUrl = resolveNextTravisCIUrl(data["@pagination"]);
    }

    return allBranches.map((branch) => ({
      name: branch.name,
      isDefault: Boolean(branch.default_branch)
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to fetch Travis CI branches: ${
          error.response?.data ? JSON.stringify(error.response?.data) : error.message || "Unknown error"
        }`
      });
    }
    throw error;
  }
};
