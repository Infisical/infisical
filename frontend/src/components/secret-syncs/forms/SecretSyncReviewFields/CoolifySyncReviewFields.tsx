import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CoolifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();
  const appId = watch("destinationConfig.appId");

  return <GenericFieldLabel label="Application ID">{appId}</GenericFieldLabel>;
};
