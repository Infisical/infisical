import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const AwsCertificateManagerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const region =
    pkiSync.destinationConfig && "region" in pkiSync.destinationConfig
      ? pkiSync.destinationConfig.region
      : undefined;

  return (
    <Detail>
      <DetailLabel>AWS Region</DetailLabel>
      <DetailValue>{region || "Not specified"}</DetailValue>
    </Detail>
  );
};
