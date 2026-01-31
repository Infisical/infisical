import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AlertTriangleIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { IconButton, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { TSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync: TSecretSync;
  onEditSource: VoidFunction;
};

export const SecretSyncSourceSection = ({ secretSync, onEditSource }: Props) => {
  const { folder, environment } = secretSync;

  const permissionSubject =
    environment && folder
      ? subject(ProjectPermissionSub.SecretSyncs, {
          environment: environment.slug,
          secretPath: folder.path,
          ...(secretSync.connectionId && { connectionId: secretSync.connectionId })
        })
      : ProjectPermissionSub.SecretSyncs;

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-medium text-mineshaft-100">Source</h3>
          <div>
            {(!folder || !environment) && (
              <Tooltip content="The source location for this sync has been deleted. Configure a new source or remove this sync.">
                <div className="mr-1 inline-block w-min">
                  <Badge variant="danger">
                    <AlertTriangleIcon />
                    Folder Deleted
                  </Badge>
                </div>
              </Tooltip>
            )}
            <ProjectPermissionCan I={ProjectPermissionSecretSyncActions.Edit} a={permissionSubject}>
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
            <GenericFieldLabel label="Environment">{environment?.name}</GenericFieldLabel>
            <GenericFieldLabel label="Path">{folder?.path}</GenericFieldLabel>
          </div>
        </div>
      </div>
    </div>
  );
};
