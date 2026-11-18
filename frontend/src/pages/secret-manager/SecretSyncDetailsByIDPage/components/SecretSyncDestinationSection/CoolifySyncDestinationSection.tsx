import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { COOLIFY_RESOURCE_TYPE_LABELS, COOLIFY_SYNC_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { CoolifyResourceType } from "@app/hooks/api/appConnections/coolify";
import { TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncDestinationSection = ({ secretSync }: Props) => {
  const { resourceType, resourceName, scope } = secretSync.destinationConfig;

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
