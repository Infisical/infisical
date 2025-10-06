import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CoolifySyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();

  const [{ autoRedeployServices }] = watch(["syncOptions"]);

  return (
    <div>
      {autoRedeployServices ? (
        <GenericFieldLabel label="Auto Redeploy Services">
          <Badge variant="success">Enabled</Badge>
        </GenericFieldLabel>
      ) : (
        <GenericFieldLabel label="Auto Redeploy Services">
          <Badge variant="danger">Disabled</Badge>
        </GenericFieldLabel>
      )}
    </div>
  );
};

export const CoolifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();
  const appId = watch("destinationConfig.appId");

  return <GenericFieldLabel label="Application ID">{appId}</GenericFieldLabel>;
};
