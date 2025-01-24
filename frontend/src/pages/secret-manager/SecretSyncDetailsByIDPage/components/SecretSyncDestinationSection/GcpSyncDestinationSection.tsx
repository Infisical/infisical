import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TGcpSync } from "@app/hooks/api/secretSyncs/types/gcp-sync";

type Props = {
  secretSync: TGcpSync;
};

export const GcpSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { projectId }
  } = secretSync;

  return <SecretSyncLabel label="Project ID">{projectId}</SecretSyncLabel>;
};
