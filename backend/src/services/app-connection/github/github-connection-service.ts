import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  getGitHubEnvironments,
  getGitHubOrganizations,
  getGitHubRepositories
} from "@app/services/app-connection/github/github-connection-fns";
import { TGitHubConnection } from "@app/services/app-connection/github/github-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGitHubConnection>;

type TListGitHubEnvironmentsDTO = {
  connectionId: string;
  repo: string;
  owner: string;
};

export const githubConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const listRepositories = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GitHub, connectionId, actor);

    const repositories = await getGitHubRepositories(appConnection, gatewayService);

    return repositories;
  };

  const listOrganizations = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GitHub, connectionId, actor);

    const organizations = await getGitHubOrganizations(appConnection, gatewayService);

    return organizations;
  };

  const listEnvironments = async (
    { connectionId, repo, owner }: TListGitHubEnvironmentsDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.GitHub, connectionId, actor);

    const environments = await getGitHubEnvironments(appConnection, gatewayService, owner, repo);

    return environments;
  };

  return {
    listRepositories,
    listOrganizations,
    listEnvironments
  };
};
