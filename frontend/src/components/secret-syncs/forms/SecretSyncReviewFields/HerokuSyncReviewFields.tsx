import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HerokuSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Heroku }>();
  const appName = watch("destinationConfig.appName");
  const appId = watch("destinationConfig.app");

  return (
    <>
      <Detail>
        <DetailLabel>App</DetailLabel>
        <DetailValue>{appName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>App ID</DetailLabel>
        <DetailValue>{appId}</DetailValue>
      </Detail>
    </>
  );
};
