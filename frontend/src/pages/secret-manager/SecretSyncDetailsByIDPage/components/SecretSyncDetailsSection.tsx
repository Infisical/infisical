import { useMemo } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretSyncLabel, SecretSyncStatusBadge } from "@app/components/secret-syncs";
import { IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SecretSyncStatus, TSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync: TSecretSync;
  onEditDetails: VoidFunction;
};

export const SecretSyncDetailsSection = ({ secretSync, onEditDetails }: Props) => {
  const { syncStatus, lastSyncMessage, lastSyncedAt, name, description } = secretSync;

  const failureMessage = useMemo(() => {
    if (syncStatus === SecretSyncStatus.Failed) {
      if (lastSyncMessage)
        try {
          return JSON.stringify(JSON.parse(lastSyncMessage), null, 2);
        } catch {
          return lastSyncMessage;
        }

      return "An Unknown Error Occurred.";
    }
    return null;
  }, [syncStatus, lastSyncMessage]);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-semibold text-mineshaft-100">Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionSecretSyncActions.Edit}
          a={ProjectPermissionSub.SecretSyncs}
        >
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              isDisabled={!isAllowed}
              ariaLabel="Edit sync details"
              onClick={onEditDetails}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div>
        <div className="space-y-3">
          <SecretSyncLabel label="Name">{name}</SecretSyncLabel>
          <SecretSyncLabel label="Description">{description}</SecretSyncLabel>
          {syncStatus && (
            <SecretSyncLabel label="Status">
              <SecretSyncStatusBadge status={syncStatus} />
            </SecretSyncLabel>
          )}
          {lastSyncedAt && (
            <SecretSyncLabel label="Last Synced">
              {format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}
            </SecretSyncLabel>
          )}
          {syncStatus === SecretSyncStatus.Failed && failureMessage && (
            <SecretSyncLabel labelClassName="text-red" label="Last Sync Error">
              <p className="break-words rounded bg-mineshaft-600 p-2 text-xs">{failureMessage}</p>
            </SecretSyncLabel>
          )}
        </div>
      </div>
    </div>
  );
};
