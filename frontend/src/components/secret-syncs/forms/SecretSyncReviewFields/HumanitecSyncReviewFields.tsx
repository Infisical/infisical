import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";

export const HumanitecSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Humanitec }>();
  const orgId = watch("destinationConfig.org");
  const appId = watch("destinationConfig.app");
  const envId = watch("destinationConfig.env");
  const scope = watch("destinationConfig.scope");

  return (
    <>
      <GenericFieldLabel label="Organization">{orgId}</GenericFieldLabel>
      <GenericFieldLabel label="Application">{appId}</GenericFieldLabel>
      {scope === HumanitecSyncScope.Environment && (
        <GenericFieldLabel label="Environment">{envId}</GenericFieldLabel>
      )}
    </>
  );
};
