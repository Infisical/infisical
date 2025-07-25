import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const NetlifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Netlify }>();
  const accountName = watch("destinationConfig.accountName");
  const accountId = watch("destinationConfig.accountId");
  const siteName = watch("destinationConfig.siteName");
  const siteId = watch("destinationConfig.siteId");
  const context = watch("destinationConfig.context");

  return (
    <>
      <GenericFieldLabel label="Account">{accountName || accountId}</GenericFieldLabel>
      <GenericFieldLabel label="Site">{siteName || siteId || "None"}</GenericFieldLabel>
      <GenericFieldLabel label="Context">{context || "None"}</GenericFieldLabel>
    </>
  );
};
