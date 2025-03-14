import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
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
      <SecretSyncLabel label="Organization">{orgId}</SecretSyncLabel>
      <SecretSyncLabel label="Application">{appId}</SecretSyncLabel>
      {scope === HumanitecSyncScope.Environment && (
        <SecretSyncLabel label="Environment">{envId}</SecretSyncLabel>
      )}
    </>
  );
};
