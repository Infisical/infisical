import { TerraformCloudSyncScope } from "@app/hooks/api/appConnections/terraform-cloud";
import { ZabbixSyncScope } from "@app/hooks/api/appConnections/zabbix";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";
import {
  GitHubSyncScope,
  GitHubSyncVisibility
} from "@app/hooks/api/secretSyncs/types/github-sync";
import { GitLabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";

// This functional ensures parity across what is displayed in the destination column
// and the values used when search filtering
export const getSecretSyncDestinationColValues = (secretSync: TSecretSync) => {
  let primaryText: string;
  let secondaryText: string | undefined;

  const { destination, destinationConfig } = secretSync;

  switch (destination) {
    case SecretSync.AWSParameterStore:
      primaryText = destinationConfig.path;
      secondaryText = destinationConfig.region;
      break;
    case SecretSync.AWSSecretsManager:
      primaryText = destinationConfig.region;
      secondaryText = destinationConfig.mappingBehavior;
      break;
    case SecretSync.GitHub:
      switch (destinationConfig.scope) {
        case GitHubSyncScope.Organization:
          primaryText = destinationConfig.org;
          if (destinationConfig.visibility === GitHubSyncVisibility.Selected) {
            secondaryText = `Organization - ${destinationConfig.selectedRepositoryIds?.length ?? 0} Repositories`;
          } else {
            secondaryText = `Organization - ${destinationConfig.visibility} Repositories`;
          }
          break;
        case GitHubSyncScope.Repository:
          primaryText = `${destinationConfig.owner}/${destinationConfig.repo}`;
          secondaryText = "Repository";
          break;
        case GitHubSyncScope.RepositoryEnvironment:
          primaryText = `${destinationConfig.owner}/${destinationConfig.repo}`;
          secondaryText = `Environment - ${destinationConfig.env}`;
          break;
        default:
          throw new Error(`Unhandled GitHub Scope Destination Col Values ${destination}`);
      }
      break;
    case SecretSync.GCPSecretManager:
      primaryText = destinationConfig.projectId;
      secondaryText =
        destinationConfig.scope === GcpSyncScope.Global ? "Global" : destinationConfig.locationId;
      break;
    case SecretSync.AzureKeyVault:
      primaryText = destinationConfig.vaultBaseUrl;
      break;
    case SecretSync.AzureAppConfiguration:
      primaryText = destinationConfig.configurationUrl;
      if (destinationConfig.label) {
        secondaryText = `Label - ${destinationConfig.label}`;
      }
      break;
    case SecretSync.Databricks:
      primaryText = destinationConfig.scope;
      break;
    case SecretSync.Humanitec:
      switch (destinationConfig.scope) {
        case HumanitecSyncScope.Application:
          primaryText = destinationConfig.app;
          break;
        case HumanitecSyncScope.Environment:
          primaryText = `${destinationConfig.app} / ${destinationConfig.env}`;
          break;
        default:
          throw new Error(`Unhandled Humanitec Scope Destination Col Values ${destination}`);
      }
      secondaryText = `Organization - ${destinationConfig.org}`;
      break;
    case SecretSync.TerraformCloud:
      primaryText = destinationConfig.org;
      if (destinationConfig.scope === TerraformCloudSyncScope.VariableSet) {
        secondaryText = destinationConfig.variableSetName;
      } else {
        secondaryText = destinationConfig.workspaceName;
      }
      break;
    case SecretSync.Camunda:
      primaryText = destinationConfig.clusterName ?? destinationConfig.clusterUUID;
      secondaryText = "Cluster";
      break;
    case SecretSync.Vercel:
      primaryText = destinationConfig.appName || destinationConfig.app;
      secondaryText = destinationConfig.env;
      break;
    case SecretSync.Windmill:
      primaryText = destinationConfig.workspace;
      secondaryText = destinationConfig.path;
      break;
    case SecretSync.HCVault:
      primaryText = destinationConfig.mount;
      secondaryText = destinationConfig.path;
      break;
    case SecretSync.TeamCity:
      primaryText = destinationConfig.project;
      secondaryText = destinationConfig.buildConfig;
      break;
    case SecretSync.OCIVault:
      primaryText = destinationConfig.compartmentOcid;
      secondaryText = destinationConfig.vaultOcid;
      break;
    case SecretSync.OnePass:
      primaryText = destinationConfig.vaultId;
      secondaryText = "Vault ID";
      break;
    case SecretSync.AzureDevOps:
      primaryText = destinationConfig.devopsProjectName;
      secondaryText = destinationConfig.devopsProjectId;
      break;
    case SecretSync.Heroku:
      primaryText = destinationConfig.appName;
      secondaryText = destinationConfig.app;
      break;
    case SecretSync.Render:
      primaryText = destinationConfig.serviceName ?? destinationConfig.serviceId;
      secondaryText = "Service";
      break;
    case SecretSync.Flyio:
      primaryText = destinationConfig.appId;
      secondaryText = "App ID";
      break;
    case SecretSync.GitLab:
      if (destinationConfig.scope === GitLabSyncScope.Project) {
        primaryText = destinationConfig.projectName;
        secondaryText = destinationConfig.projectId;
      } else if (destinationConfig.scope === GitLabSyncScope.Group) {
        primaryText = destinationConfig.groupName;
        secondaryText = destinationConfig.groupId;
      } else {
        throw new Error(`Unhandled GitLab Scope Destination Col Values ${destination}`);
      }
      break;
    case SecretSync.CloudflarePages:
      primaryText = destinationConfig.projectName;
      secondaryText = destinationConfig.environment;
      break;
    case SecretSync.Zabbix:
      if (destinationConfig.scope === ZabbixSyncScope.Host) {
        primaryText = destinationConfig.hostName;
        secondaryText = destinationConfig.hostId;
      } else if (destinationConfig.scope === ZabbixSyncScope.Global) {
        primaryText = "Global";
        secondaryText = "";
      } else {
        throw new Error(`Unhandled Zabbix Scope Destination Col Values ${destination}`);
      }
      break;
    default:
      throw new Error(`Unhandled Destination Col Values ${destination}`);
  }

  return {
    primaryText,
    secondaryText
  };
};
