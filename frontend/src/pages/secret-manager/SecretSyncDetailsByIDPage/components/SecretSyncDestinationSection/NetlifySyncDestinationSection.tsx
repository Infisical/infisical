import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TNetlifySync } from "@app/hooks/api/secretSyncs/types/netlify-sync";

type Props = {
  secretSync: TNetlifySync;
};

export const NetlifySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Account</DetailLabel>
        <DetailValue>{destinationConfig.accountName || destinationConfig.accountId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Site</DetailLabel>
        <DetailValue>
          {destinationConfig.siteName || destinationConfig.siteId || "None"}
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        <DetailValue>{destinationConfig.context || "None"}</DetailValue>
      </Detail>
    </>
  );
};
