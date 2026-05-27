import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const NetlifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Netlify }>();
  const accountName = watch("destinationConfig.accountName");
  const accountId = watch("destinationConfig.accountId");
  const siteName = watch("destinationConfig.siteName");
  const siteId = watch("destinationConfig.siteId");
  const context = watch("destinationConfig.context");

  const site = siteName || siteId;

  return (
    <>
      <Detail>
        <DetailLabel>Account</DetailLabel>
        <DetailValue>{accountName || accountId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Site</DetailLabel>
        {site ? (
          <DetailValue>{site}</DetailValue>
        ) : (
          <DetailValue className="text-muted">—</DetailValue>
        )}
      </Detail>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        {context ? (
          <DetailValue>{context}</DetailValue>
        ) : (
          <DetailValue className="text-muted">—</DetailValue>
        )}
      </Detail>
    </>
  );
};
