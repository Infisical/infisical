import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HerokuSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Heroku }>();
  const appName = watch("destinationConfig.appName");
  const appId = watch("destinationConfig.app");

  return (
    <>
      <GenericFieldLabel label="App">{appName}</GenericFieldLabel>
      <GenericFieldLabel label="App ID">{appId}</GenericFieldLabel>
    </>
  );
};
