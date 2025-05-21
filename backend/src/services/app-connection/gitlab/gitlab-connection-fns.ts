import { GitbeakerRequestError, Gitlab } from "@gitbeaker/rest";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { GitLabConnectionMethod } from "./gitlab-connection-enums";
import { TGitLabConnection, TGitLabConnectionConfig } from "./gitlab-connection-types";

export const getGitLabConnectionUrl = async (config: TGitLabConnectionConfig) => {
  const { instanceUrl } = config.credentials;

  const host = instanceUrl ? removeTrailingSlash(instanceUrl) : "https://www.gitlab.com";

  await blockLocalAndPrivateIpAddresses(host);

  return host;
};

export const getGitLabConnectionClient = async (config: TGitLabConnectionConfig) => {
  const { accessToken } = config.credentials;

  const host = await getGitLabConnectionUrl(config);

  const client = new Gitlab<true>({
    host,
    token: accessToken,
    camelize: true
  });

  return client;
};

export const getGitLabConnectionListItem = () => {
  return {
    name: "GitLab" as const,
    app: AppConnection.GitLab as const,
    methods: Object.values(GitLabConnectionMethod) as [GitLabConnectionMethod.AccessToken]
  };
};

export const validateGitLabConnectionCredentials = async (config: TGitLabConnectionConfig) => {
  try {
    const client = await getGitLabConnectionClient(config);
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

  return config.credentials;
};

export const listGitLabConnectionProjects = async (appConnection: TGitLabConnection) => {
  const client = await getGitLabConnectionClient(appConnection);

  const projects = await client.Projects.all({
    archived: false,
    includePendingDelete: false,
    membership: true,
    includeHidden: false,
    imported: false
  });
  return projects;
};
