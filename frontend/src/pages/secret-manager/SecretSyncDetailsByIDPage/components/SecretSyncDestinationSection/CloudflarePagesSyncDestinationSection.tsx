import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TCloudflarePagesSync } from "@app/hooks/api/secretSyncs/types/cloudflare-pages-sync";

type Props = {
  secretSync: TCloudflarePagesSync;
};

export const CloudflarePagesSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { projectName, environment }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environment}</DetailValue>
      </Detail>
    </>
  );
};
