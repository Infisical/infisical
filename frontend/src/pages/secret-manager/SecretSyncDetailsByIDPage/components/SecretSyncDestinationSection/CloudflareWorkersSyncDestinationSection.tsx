import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TCloudflareWorkersSync } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

type Props = {
  secretSync: TCloudflareWorkersSync;
};

export const CloudflareWorkersSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { scriptId }
  } = secretSync;

  return <GenericFieldLabel label="Script ID">{scriptId}</GenericFieldLabel>;
};
