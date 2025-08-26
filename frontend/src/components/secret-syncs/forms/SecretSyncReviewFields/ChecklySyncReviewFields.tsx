import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ChecklySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Checkly }>();
  const config = watch("destinationConfig");

  return (
    <>
      <GenericFieldLabel label="Account">
        {config.accountName ?? config.accountId}
      </GenericFieldLabel>
      {config.groupId && (
        <GenericFieldLabel label="Group">{config.groupName ?? config.groupId}</GenericFieldLabel>
      )}
    </>
  );
};
