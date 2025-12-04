/* eslint-disable jsx-a11y/label-has-associated-control */
import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AlertTriangleIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-sm text-bunker-300">{label}</label>
    <div className="mt-1">{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
  onEditSource: VoidFunction;
};

export const PkiSyncSourceSection = ({ pkiSync, onEditSource }: Props) => {
  const { subscriberId, subscriber } = pkiSync;

  const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberName: destinationName,
    name: pkiSync.name
  });

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-medium text-mineshaft-100">Source</h3>
          <div>
            {!subscriberId && (
              <Tooltip content="The PKI subscriber for this sync has been deleted. Configure a new source or remove this sync.">
                <Badge variant="danger" className="mr-1">
                  <AlertTriangleIcon />
                  Source Deleted
                </Badge>
              </Tooltip>
            )}
            <ProjectPermissionCan I={ProjectPermissionPkiSyncActions.Edit} a={permissionSubject}>
              {(isAllowed) => (
                <IconButton
                  variant="plain"
                  colorSchema="secondary"
                  isDisabled={!isAllowed}
                  ariaLabel="Edit sync source"
                  onClick={onEditSource}
                >
                  <FontAwesomeIcon icon={faEdit} />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </div>
        </div>
        <div>
          <div className="space-y-3">
            <GenericFieldLabel label="PKI Subscriber">
              {subscriber ? subscriber.name : "Deleted"}
            </GenericFieldLabel>
          </div>
        </div>
      </div>
    </div>
  );
};
