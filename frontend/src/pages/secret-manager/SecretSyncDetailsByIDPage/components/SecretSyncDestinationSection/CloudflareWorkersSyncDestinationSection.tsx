import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TCloudflareWorkersSync } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

type Props = {
  secretSync: TCloudflareWorkersSync;
};

export const CloudflareWorkersSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { scriptId, previewName }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Script ID</DetailLabel>
        <DetailValue>{scriptId}</DetailValue>
      </Detail>
      {previewName && (
        <Detail>
          <DetailLabel>Preview</DetailLabel>
          <DetailValue>{previewName}</DetailValue>
        </Detail>
      )}
    </>
  );
};
