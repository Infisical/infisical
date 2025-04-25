import { ReactNode } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { AwsParameterStoreSyncDestinationSection } from "./AwsParameterStoreSyncDestinationSection";
import { AwsSecretsManagerSyncDestinationSection } from "./AwsSecretsManagerSyncDestinationSection";
import { AzureAppConfigurationSyncDestinationSection } from "./AzureAppConfigurationSyncDestinationSection";
import { AzureKeyVaultSyncDestinationSection } from "./AzureKeyVaultSyncDestinationSection";
import { CamundaSyncDestinationSection } from "./CamundaSyncDestinationSection";
import { DatabricksSyncDestinationSection } from "./DatabricksSyncDestinationSection";
import { GcpSyncDestinationSection } from "./GcpSyncDestinationSection";
import { GitHubSyncDestinationSection } from "./GitHubSyncDestinationSection";
import { HCVaultSyncDestinationSection } from "./HCVaultSyncDestinationSection";
import { HumanitecSyncDestinationSection } from "./HumanitecSyncDestinationSection";
import { TeamCitySyncDestinationSection } from "./TeamCitySyncDestinationSection";
import { TerraformCloudSyncDestinationSection } from "./TerraformCloudSyncDestinationSection";
import { VercelSyncDestinationSection } from "./VercelSyncDestinationSection";
import { WindmillSyncDestinationSection } from "./WindmillSyncDestinationSection";

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
    default:
      throw new Error(`Unhandled Destination Section components: ${destination}`);
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-semibold text-mineshaft-100">Destination Configuration</h3>
        <ProjectPermissionCan
          I={ProjectPermissionSecretSyncActions.Edit}
          a={ProjectPermissionSub.SecretSyncs}
        >
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
