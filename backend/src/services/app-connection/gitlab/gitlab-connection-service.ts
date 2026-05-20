import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import {
  listGitLabGroupProjects,
  listGitLabGroupSubgroups,
  listGitLabGroups,
  listGitLabProjects,
  listGitLabRootGroups
} from "./gitlab-connection-fns";
import { TGitLabConnection } from "./gitlab-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGitLabConnection>;

export const gitlabConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    try {
      const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
      const projects = await listGitLabProjects({ appConnection, appConnectionDAL, kmsService });
      return projects;
    } catch (error) {
      logger.error(error, `Failed to establish connection with GitLab for app ${connectionId}`);
      return [];
    }
  };

  const listGroups = async (connectionId: string, actor: OrgServiceActor) => {
    try {
      const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
      const groups = await listGitLabGroups({ appConnection, appConnectionDAL, kmsService });
      return groups;
    } catch (error) {
      logger.error(error, `Failed to establish connection with GitLab for app ${connectionId}`);
      return [];
    }
  };

  const listRootGroups = async (connectionId: string, actor: OrgServiceActor) => {
    try {
      const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
      return await listGitLabRootGroups({ appConnection, appConnectionDAL, kmsService });
    } catch (error) {
      logger.error(error, `Failed to list root groups for GitLab connection ${connectionId}`);
      return [];
    }
  };

  const listGroupSubgroups = async (connectionId: string, groupId: string, actor: OrgServiceActor) => {
    try {
      const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
      return await listGitLabGroupSubgroups(groupId, { appConnection, appConnectionDAL, kmsService });
    } catch (error) {
      logger.error(error, `Failed to list subgroups for GitLab group ${groupId}`);
      return [];
    }
  };

  const listGroupProjects = async (connectionId: string, groupId: string, actor: OrgServiceActor) => {
    try {
      const appConnection = await getAppConnection(AppConnection.GitLab, connectionId, actor);
      return await listGitLabGroupProjects(groupId, { appConnection, appConnectionDAL, kmsService });
    } catch (error) {
      logger.error(error, `Failed to list projects for GitLab group ${groupId}`);
      return [];
    }
  };

  return {
    listProjects,
    listGroups,
    listRootGroups,
    listGroupSubgroups,
    listGroupProjects
  };
};
