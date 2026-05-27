import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ChecklySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Checkly }>();
  const config = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>Account</DetailLabel>
        <DetailValue>{config.accountName ?? config.accountId}</DetailValue>
      </Detail>
      {config.groupId && (
        <Detail>
          <DetailLabel>Group</DetailLabel>
          <DetailValue>{config.groupName ?? config.groupId}</DetailValue>
        </Detail>
      )}
    </>
  );
};
