import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DevinSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Devin }>();
  const orgId = watch("destinationConfig.orgId");

  return <GenericFieldLabel label="Organization ID">{orgId}</GenericFieldLabel>;
};
