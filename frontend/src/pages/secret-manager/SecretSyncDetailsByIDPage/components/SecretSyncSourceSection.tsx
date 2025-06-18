import { subject } from "@casl/ability";
import { faEdit, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge, IconButton, Tooltip } from "@app/components/v2";
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
          secretPath: folder.path
        })
      : ProjectPermissionSub.SecretSyncs;

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-semibold text-mineshaft-100">Source</h3>
          <div>
            {(!folder || !environment) && (
              <Tooltip content="The source location for this sync has been deleted. Configure a new source or remove this sync.">
                <div className="mr-1 inline-block w-min">
                  <Badge
                    className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
                    variant="primary"
                  >
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    <span>Folder Deleted</span>
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
