import { ReactNode } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretSyncLabel } from "@app/components/secret-syncs";
import { IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";
import { AwsParameterStoreSyncDestinationSection } from "@app/pages/secret-manager/SecretSyncDetailsByIDPage/components/SecretSyncDestinationSection/AwsParameterStoreSyncDestinationSection";
import { AwsSecretsManagerSyncDestinationSection } from "@app/pages/secret-manager/SecretSyncDetailsByIDPage/components/SecretSyncDestinationSection/AwsSecretsManagerSyncDestinationSection";
import { DatabricksSyncDestinationSection } from "@app/pages/secret-manager/SecretSyncDetailsByIDPage/components/SecretSyncDestinationSection/DatabricksSyncDestinationSection";
import { GitHubSyncDestinationSection } from "@app/pages/secret-manager/SecretSyncDetailsByIDPage/components/SecretSyncDestinationSection/GitHubSyncDestinationSection";

import { AzureAppConfigurationSyncDestinationSection } from "./AzureAppConfigurationSyncDestinationSection";
import { AzureKeyVaultSyncDestinationSection } from "./AzureKeyVaultSyncDestinationSection";
import { GcpSyncDestinationSection } from "./GcpSyncDestinationSection";
import { HumanitecSyncDestinationSection } from "./HumanitecSyncDestinationSection";

type Props = {
  secretSync: TSecretSync;
  onEditDestination: VoidFunction;
};

export const SecretSyncDestinationSection = ({ secretSync, onEditDestination }: Props) => {
  const { destination, connection } = secretSync;

  const app = APP_CONNECTION_MAP[connection.app].name;

  let DestinationComponents: ReactNode;
  switch (secretSync.destination) {
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
        <SecretSyncLabel label={`${app} Connection`}>{connection.name}</SecretSyncLabel>
        {DestinationComponents}
      </div>
    </div>
  );
};
