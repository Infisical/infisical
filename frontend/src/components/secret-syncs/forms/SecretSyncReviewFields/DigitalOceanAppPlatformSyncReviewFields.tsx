import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DigitalOceanAppPlatformSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.DigitalOceanAppPlatform }
  >();
  const appName = watch("destinationConfig.appName");

  return <GenericFieldLabel label="App">{appName}</GenericFieldLabel>;
};
