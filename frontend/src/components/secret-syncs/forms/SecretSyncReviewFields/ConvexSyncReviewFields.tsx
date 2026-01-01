import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ConvexSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Convex }>();
  const deploymentUrl = watch("destinationConfig.deploymentUrl");

  return <GenericFieldLabel label="Deployment URL">{deploymentUrl}</GenericFieldLabel>;
};
