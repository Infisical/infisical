import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
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
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const listRepositories = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GitHub, connectionId, actor);

    const repositories = await getGitHubRepositories(appConnection, gatewayService, gatewayV2Service);

    return repositories;
  };

  const listOrganizations = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.GitHub, connectionId, actor);

    const organizations = await getGitHubOrganizations(appConnection, gatewayService, gatewayV2Service);

    return organizations;
  };

  const listEnvironments = async (
    { connectionId, repo, owner }: TListGitHubEnvironmentsDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await getAppConnection(AppConnection.GitHub, connectionId, actor);

    const environments = await getGitHubEnvironments(appConnection, gatewayService, gatewayV2Service, owner, repo);

    return environments;
  };

  return {
    listRepositories,
    listOrganizations,
    listEnvironments
  };
};
