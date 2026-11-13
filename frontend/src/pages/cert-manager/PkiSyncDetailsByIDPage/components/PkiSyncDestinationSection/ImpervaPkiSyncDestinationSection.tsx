import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TImpervaPkiSync } from "@app/hooks/api/pkiSyncs/types/imperva-sync";

type Props = {
  pkiSync: TImpervaPkiSync;
};

export const ImpervaPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const { siteId, siteName } = pkiSync.destinationConfig;

  return (
    <Detail>
      <DetailLabel>Website</DetailLabel>
      <DetailValue>{siteName ? `${siteName} (${siteId})` : siteId}</DetailValue>
    </Detail>
  );
};
