import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { COOLIFY_RESOURCE_TYPE_LABELS, COOLIFY_SYNC_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { CoolifyResourceType } from "@app/hooks/api/appConnections/coolify";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CoolifySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Coolify }>();
  const { resourceType, resourceName, scope } = watch("destinationConfig");

  return (
    <>
      <Detail>
        <DetailLabel>{COOLIFY_RESOURCE_TYPE_LABELS[resourceType]}</DetailLabel>
        <DetailValue>{resourceName}</DetailValue>
      </Detail>
      {resourceType === CoolifyResourceType.Application && (
        <Detail>
          <DetailLabel>Scope</DetailLabel>
          <DetailValue>{COOLIFY_SYNC_SCOPE_LABELS[scope]}</DetailValue>
        </Detail>
      )}
    </>
  );
};
