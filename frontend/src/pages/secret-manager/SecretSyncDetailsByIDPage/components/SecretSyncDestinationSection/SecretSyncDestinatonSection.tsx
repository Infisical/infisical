import { ReactNode } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { IconButton } from "@app/components/v2";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";

import { OnePassSyncDestinationSection } from "./1PasswordSyncDestinationSection";
import { AwsParameterStoreSyncDestinationSection } from "./AwsParameterStoreSyncDestinationSection";
import { AwsSecretsManagerSyncDestinationSection } from "./AwsSecretsManagerSyncDestinationSection";
import { AzureAppConfigurationSyncDestinationSection } from "./AzureAppConfigurationSyncDestinationSection";
import { AzureDevOpsSyncDestinationSection } from "./AzureDevOpsSyncDestinationSection";
import { AzureKeyVaultSyncDestinationSection } from "./AzureKeyVaultSyncDestinationSection";
import { BitbucketSyncDestinationSection } from "./BitbucketSyncDestinationSection";
import { CamundaSyncDestinationSection } from "./CamundaSyncDestinationSection";
import { ChecklySyncDestinationSection } from "./ChecklySyncDestinationSection";
import { ChefSyncDestinationSection } from "./ChefSyncDestinationSection";
import { CircleCISyncDestinationSection } from "./CircleCISyncDestinationSection";
import { CloudflarePagesSyncDestinationSection } from "./CloudflarePagesSyncDestinationSection";
import { CloudflareWorkersSyncDestinationSection } from "./CloudflareWorkersSyncDestinationSection";
import { CoolifySyncDestinationSection } from "./CoolifySyncDestinationSection";
import { DatabricksSyncDestinationSection } from "./DatabricksSyncDestinationSection";
import { DigitalOceanAppPlatformSyncDestinationSection } from "./DigitalOceanAppPlatformSyncDestinationSection";
import { FlyioSyncDestinationSection } from "./FlyioSyncDestinationSection";
import { GcpSyncDestinationSection } from "./GcpSyncDestinationSection";
import { GitHubSyncDestinationSection } from "./GitHubSyncDestinationSection";
import { GitLabSyncDestinationSection } from "./GitLabSyncDestinationSection";
import { HCVaultSyncDestinationSection } from "./HCVaultSyncDestinationSection";
import { HerokuSyncDestinationSection } from "./HerokuSyncDestinationSection";
import { HumanitecSyncDestinationSection } from "./HumanitecSyncDestinationSection";
import { LaravelForgeSyncDestinationSection } from "./LaravelForgeSyncDestinationSection";
import { NetlifySyncDestinationSection } from "./NetlifySyncDestinationSection";
import { NorthflankSyncDestinationSection } from "./NorthflankSyncDestinationSection";
import { OCIVaultSyncDestinationSection } from "./OCIVaultSyncDestinationSection";
import { OctopusDeploySyncDestinationSection } from "./OctopusDeploySyncDestinationSection";
import { RailwaySyncDestinationSection } from "./RailwaySyncDestinationSection";
import { RenderSyncDestinationSection } from "./RenderSyncDestinationSection";
import { SupabaseSyncDestinationSection } from "./SupabaseSyncDestinationSection";
import { TeamCitySyncDestinationSection } from "./TeamCitySyncDestinationSection";
import { TerraformCloudSyncDestinationSection } from "./TerraformCloudSyncDestinationSection";
import { VercelSyncDestinationSection } from "./VercelSyncDestinationSection";
import { WindmillSyncDestinationSection } from "./WindmillSyncDestinationSection";
import { ZabbixSyncDestinationSection } from "./ZabbixSyncDestinationSection";

type Props = {
  secretSync: TSecretSync;
  onEditDestination: VoidFunction;
};

export const SecretSyncDestinationSection = ({ secretSync, onEditDestination }: Props) => {
  const { destination, connection } = secretSync;

  const app = APP_CONNECTION_MAP[connection.app].name;

  let DestinationComponents: ReactNode;
  switch (destination) {
    case SecretSync.AWSParameterStore:
      DestinationComponents = <AwsParameterStoreSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AWSSecretsManager:
      DestinationComponents = <AwsSecretsManagerSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.GitHub:
      DestinationComponents = <GitHubSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.GCPSecretManager:
      DestinationComponents = <GcpSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AzureKeyVault:
      DestinationComponents = <AzureKeyVaultSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AzureAppConfiguration:
      DestinationComponents = (
        <AzureAppConfigurationSyncDestinationSection secretSync={secretSync} />
      );
      break;
    case SecretSync.Databricks:
      DestinationComponents = <DatabricksSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Humanitec:
      DestinationComponents = <HumanitecSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.TerraformCloud:
      DestinationComponents = <TerraformCloudSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Camunda:
      DestinationComponents = <CamundaSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Vercel:
      DestinationComponents = <VercelSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Windmill:
      DestinationComponents = <WindmillSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.HCVault:
      DestinationComponents = <HCVaultSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.TeamCity:
      DestinationComponents = <TeamCitySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.OCIVault:
      DestinationComponents = <OCIVaultSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.OnePass:
      DestinationComponents = <OnePassSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.AzureDevOps:
      DestinationComponents = <AzureDevOpsSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Heroku:
      DestinationComponents = <HerokuSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Render:
      DestinationComponents = <RenderSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Flyio:
      DestinationComponents = <FlyioSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.GitLab:
      DestinationComponents = <GitLabSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.CloudflarePages:
      DestinationComponents = <CloudflarePagesSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.CloudflareWorkers:
      DestinationComponents = <CloudflareWorkersSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Zabbix:
      DestinationComponents = <ZabbixSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Railway:
      DestinationComponents = <RailwaySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Checkly:
      DestinationComponents = <ChecklySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Supabase:
      DestinationComponents = <SupabaseSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.DigitalOceanAppPlatform:
      DestinationComponents = (
        <DigitalOceanAppPlatformSyncDestinationSection secretSync={secretSync} />
      );
      break;
    case SecretSync.Netlify:
      DestinationComponents = <NetlifySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Northflank:
      DestinationComponents = <NorthflankSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Bitbucket:
      DestinationComponents = <BitbucketSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.LaravelForge:
      DestinationComponents = <LaravelForgeSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Chef:
      DestinationComponents = <ChefSyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.OctopusDeploy:
      DestinationComponents = <OctopusDeploySyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.CircleCI:
      DestinationComponents = <CircleCISyncDestinationSection secretSync={secretSync} />;
      break;
    case SecretSync.Coolify:
      DestinationComponents = <CoolifySyncDestinationSection secretSync={secretSync} />;
      break;
    default:
      throw new Error(`Unhandled Destination Section components: ${destination}`);
  }

  const permissionSubject = getSecretSyncPermissionSubject(secretSync);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Destination Configuration</h3>
        <ProjectPermissionCan I={ProjectPermissionSecretSyncActions.Edit} a={permissionSubject}>
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              isDisabled={!isAllowed}
              ariaLabel="Edit sync destination"
              onClick={onEditDestination}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="flex w-full flex-wrap gap-8">
        <GenericFieldLabel label={`${app} Connection`}>{connection.name}</GenericFieldLabel>
        {DestinationComponents}
      </div>
    </div>
  );
};
