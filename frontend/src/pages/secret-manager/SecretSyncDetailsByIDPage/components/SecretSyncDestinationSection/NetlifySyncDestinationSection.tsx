import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TNetlifySync } from "@app/hooks/api/secretSyncs/types/netlify-sync";

type Props = {
  secretSync: TNetlifySync;
};

export const NetlifySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Account">
        {destinationConfig.accountName || destinationConfig.accountId}
      </GenericFieldLabel>
      <GenericFieldLabel label="Site">
        {destinationConfig.siteName || destinationConfig.siteId || "None"}
      </GenericFieldLabel>
      <GenericFieldLabel label="Context">{destinationConfig.context || "None"}</GenericFieldLabel>
    </>
  );
};
