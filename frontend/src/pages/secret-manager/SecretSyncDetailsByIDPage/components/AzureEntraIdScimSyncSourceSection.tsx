import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AlertTriangleIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { IconButton, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";
import { TSecretSync } from "@app/hooks/api/secretSyncs";
import { TAzureEntraIdScimSync } from "@app/hooks/api/secretSyncs/types/azure-entra-id-scim-sync";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";

type Props = {
  secretSync: TSecretSync;
  onEditSource: VoidFunction;
};

export const AzureEntraIdScimSyncSourceSection = ({ secretSync, onEditSource }: Props) => {
  const { folder, environment } = secretSync;
  const { currentProject } = useProject();

  const scimSync = secretSync as TAzureEntraIdScimSync;
  const secretId = scimSync.syncOptions?.secretId;

  const { data: secrets } = useGetProjectSecrets({
    projectId: currentProject.id,
    environment: environment?.slug ?? "",
    secretPath: folder?.path ?? "/",
    viewSecretValue: false,
    options: {
      enabled: Boolean(secretId && environment?.slug && folder?.path)
    }
  });

  const secretName = secretId ? secrets?.find((s) => s.id === secretId)?.key : undefined;

  const permissionSubject = getSecretSyncPermissionSubject(secretSync);

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
            {secretName && <GenericFieldLabel label="Secret">{secretName}</GenericFieldLabel>}
          </div>
        </div>
      </div>
    </div>
  );
};
