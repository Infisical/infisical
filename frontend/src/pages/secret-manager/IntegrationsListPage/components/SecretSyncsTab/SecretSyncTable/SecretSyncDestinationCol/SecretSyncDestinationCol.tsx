import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { AwsParameterStoreSyncDestinationCol } from "./AwsParameterStoreSyncDestinationCol";
import { GitHubSyncDestinationCol } from "./GitHubSyncDestinationCol";

type Props = {
  secretSync: TSecretSync;
};

export const SecretSyncDestinationCol = ({ secretSync }: Props) => {
  switch (secretSync.destination) {
    case SecretSync.AWSParameterStore:
      return <AwsParameterStoreSyncDestinationCol secretSync={secretSync} />;
    case SecretSync.GitHub:
      return <GitHubSyncDestinationCol secretSync={secretSync} />;
    default:
      throw new Error(
        `Unhandled Secret Sync Destination Col: ${(secretSync as TSecretSync).destination}`
      );
  }
};
