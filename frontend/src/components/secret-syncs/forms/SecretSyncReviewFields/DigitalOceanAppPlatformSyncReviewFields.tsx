import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DigitalOceanAppPlatformSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.DigitalOceanAppPlatform }
  >();
  const appName = watch("destinationConfig.appName");

  return (
    <Detail>
      <DetailLabel>App</DetailLabel>
      <DetailValue>{appName}</DetailValue>
    </Detail>
  );
};
