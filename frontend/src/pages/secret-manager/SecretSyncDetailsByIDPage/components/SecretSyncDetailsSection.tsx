import { useMemo } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel, SecretSyncStatusBadge } from "@app/components/secret-syncs";
import { IconButton } from "@app/components/v2";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";
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

  const permissionSubject = getSecretSyncPermissionSubject(secretSync);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Details</h3>
        <ProjectPermissionCan I={ProjectPermissionSecretSyncActions.Edit} a={permissionSubject}>
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
          <GenericFieldLabel label="Name" truncate>
            {name}
          </GenericFieldLabel>
          <GenericFieldLabel label="Description">{description}</GenericFieldLabel>
          {syncStatus && (
            <GenericFieldLabel label="Status">
              <SecretSyncStatusBadge status={syncStatus} />
            </GenericFieldLabel>
          )}
          {lastSyncedAt && (
            <GenericFieldLabel label="Last Synced">
              {format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}
            </GenericFieldLabel>
          )}
          {syncStatus === SecretSyncStatus.Failed && failureMessage && (
            <GenericFieldLabel labelClassName="text-red" label="Last Sync Error">
              <p className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
                {failureMessage}
              </p>
            </GenericFieldLabel>
          )}
        </div>
      </div>
    </div>
  );
};
