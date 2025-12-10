import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum OctopusDeploySyncScope {
  Project = "project"
}

type TOctopusDeploySyncDestinationConfigProject = {
  scope: OctopusDeploySyncScope.Project;
  projectId: string;
  scopeValues?: {
    environments?: string[];
    roles?: string[];
    machines?: string[];
    processes?: string[];
    actions?: string[];
    channels?: string[];
  };
};

type TOctopusDeploySyncDestinationConfig = {
  spaceId: string;
} & TOctopusDeploySyncDestinationConfigProject;

export type TOctopusDeploySync = TRootSecretSync & {
  destination: SecretSync.OctopusDeploy;
  destinationConfig: TOctopusDeploySyncDestinationConfig;

  connection: {
    app: AppConnection.OctopusDeploy;
    name: string;
    id: string;
  };
};
