import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { listGitLabGroups, listGitLabGroupServiceAccounts, listGitLabProjects } from "./gitlab-connection-fns";
import { TGitLabConnection } from "./gitlab-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGitLabConnection>;

export const gitlabConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsDataKeyService: TKmsDataKeyService
) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor, search?: string, limit?: number) => {
    try {
      const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
      const projects = await listGitLabProjects({
        appConnection,
        appConnectionDAL,
        kmsDataKeyService,
        search,
        limit
      });
      return projects;
    } catch (error) {
      logger.error(error, `Failed to establish connection with GitLab for app ${connectionId}`);
      if (error instanceof RateLimitError) throw error;
      return [];
    }
  };

  const listGroups = async (connectionId: string, actor: OrgServiceActor, search?: string, limit?: number) => {
    try {
      const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
      const groups = await listGitLabGroups({
        appConnection,
        appConnectionDAL,
        kmsDataKeyService,
        search,
        limit
      });
      return groups;
    } catch (error) {
      logger.error(error, `Failed to establish connection with GitLab for app ${connectionId}`);
      if (error instanceof RateLimitError) throw error;
      return [];
    }
  };

  const listGroupServiceAccounts = async (connectionId: string, groupId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);

    return listGitLabGroupServiceAccounts({ appConnection, appConnectionDAL, kmsDataKeyService, groupId });
  };

  return {
    listProjects,
    listGroups,
    listGroupServiceAccounts
  };
};
