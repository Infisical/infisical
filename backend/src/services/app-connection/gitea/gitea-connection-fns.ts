import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { GiteaConnectionMethod } from "./gitea-connection-enums";
import { TGiteaConnection, TGiteaConnectionConfig, TGiteaRepository } from "./gitea-connection-types";

const GITEA_PAGE_SIZE = 50;
const GITEA_MAX_PAGES = 20;

const giteaApiHeaders = (accessToken: string) => ({
  Authorization: `token ${accessToken}`,
  Accept: "application/json"
});

const buildGiteaApiUrl = (instanceUrl: string, path: string): string => {
  return `${removeTrailingSlash(instanceUrl)}/api/v1${path}`;
};

export const getGiteaConnectionListItem = () => {
  return {
    name: "Gitea" as const,
    app: AppConnection.Gitea as const,
    methods: Object.values(GiteaConnectionMethod) as [GiteaConnectionMethod.ApiToken]
  };
};

export const validateGiteaConnectionCredentials = async (config: TGiteaConnectionConfig) => {
  const { instanceUrl, accessToken } = config.credentials;

  // SSRF guard: block requests to localhost / private IPs
  await blockLocalAndPrivateIpAddresses(instanceUrl);

  try {
    // Validates the token by listing 1 repo. Uses repos/search (works with the
    // `write:repository` scope alone — no need to require `read:user`).
    // See: https://docs.gitea.com/api/1.20/#tag/repository/operation/repoSearch
    await request.get(buildGiteaApiUrl(instanceUrl, "/repos/search?limit=1"), {
      headers: giteaApiHeaders(accessToken)
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

  return config.credentials;
};

export const listGiteaRepositories = async (appConnection: TGiteaConnection): Promise<TGiteaRepository[]> => {
  const { instanceUrl, accessToken } = appConnection.credentials;

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  const headers = giteaApiHeaders(accessToken);

  const allRepos: TGiteaRepository[] = [];
  let page = 1;
  let iterationCount = 0;

  // Gitea repo search supports `page` + `limit`. Loop until response page is shorter than limit
  // or we reach our safety cap (GITEA_MAX_PAGES * GITEA_PAGE_SIZE = 1000 repos max).
  // See: https://docs.gitea.com/api/1.20/#tag/repository/operation/repoSearch
  while (iterationCount < GITEA_MAX_PAGES) {
    const url = buildGiteaApiUrl(instanceUrl, `/repos/search?limit=${GITEA_PAGE_SIZE}&page=${page}&private=true`);

    let pageData: TGiteaRepository[] = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await request.get<{ data: TGiteaRepository[]; ok: boolean }>(url, { headers });
      pageData = data?.data ?? [];
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        throw new BadRequestError({
          message: `Failed to fetch Gitea repositories: ${
            error.response?.data ? JSON.stringify(error.response?.data) : error.message || "Unknown error"
          }`
        });
      }
      throw error;
    }

    allRepos.push(...pageData);

    if (pageData.length < GITEA_PAGE_SIZE) break;

    page += 1;
    iterationCount += 1;
  }

  return allRepos;
};
