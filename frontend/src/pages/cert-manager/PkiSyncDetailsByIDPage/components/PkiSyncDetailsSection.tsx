/* eslint-disable jsx-a11y/label-has-associated-control */
import { useMemo } from "react";
import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PkiSyncStatusBadge } from "@app/components/pki-syncs";
import { IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSyncStatus, TPkiSync } from "@app/hooks/api/pkiSyncs";

const GenericFieldLabel = ({
  label,
  children,
  labelClassName,
  truncate
}: {
  label: string;
  children: React.ReactNode;
  labelClassName?: string;
  truncate?: boolean;
}) => (
  <div className="mb-4">
    <p className={`text-sm font-medium text-mineshaft-300 ${labelClassName || ""}`}>{label}</p>
    <div className={`text-sm text-mineshaft-300 ${truncate ? "truncate" : ""}`}>{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
  onEditDetails: VoidFunction;
};

export const PkiSyncDetailsSection = ({ pkiSync, onEditDetails }: Props) => {
  const { syncStatus, lastSyncMessage, lastSyncedAt, name, description, subscriber } = pkiSync;

  const failureMessage = useMemo(() => {
    if (syncStatus === PkiSyncStatus.Failed) {
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

  const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberName: destinationName,
    name: pkiSync.name
  });

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Details</h3>
        <ProjectPermissionCan I={ProjectPermissionPkiSyncActions.Edit} a={permissionSubject}>
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
      <div className="pt-2">
        <GenericFieldLabel label="Name" truncate>{name}</GenericFieldLabel>
        <GenericFieldLabel label="Description">{description || "None"}</GenericFieldLabel>
        {subscriber && (
          <GenericFieldLabel label="Source Subscriber">{subscriber.name}</GenericFieldLabel>
        )}
        {syncStatus && (
          <GenericFieldLabel label="Status">
            <PkiSyncStatusBadge status={syncStatus} />
          </GenericFieldLabel>
        )}
        {lastSyncedAt && (
          <GenericFieldLabel label="Last Synced">
            {format(new Date(lastSyncedAt), "yyyy-MM-dd, h:mm aaa")}
          </GenericFieldLabel>
        )}
        {syncStatus === PkiSyncStatus.Failed && failureMessage && (
          <GenericFieldLabel labelClassName="text-red" label="Last Sync Error">
            <p className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">{failureMessage}</p>
          </GenericFieldLabel>
        )}
      </div>
    </div>
  );
};
