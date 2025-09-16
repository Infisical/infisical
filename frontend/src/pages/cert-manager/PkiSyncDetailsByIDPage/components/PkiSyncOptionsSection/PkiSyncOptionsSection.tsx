import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge, IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
  onEditOptions: VoidFunction;
};

export const PkiSyncOptionsSection = ({ pkiSync, onEditOptions }: Props) => {
  const {
    syncOptions: { canImportCertificates, canRemoveCertificates }
  } = pkiSync;

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberId: pkiSync.subscriberId || ""
  });

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-semibold text-mineshaft-100">Sync Options</h3>
          <ProjectPermissionCan I={ProjectPermissionPkiSyncActions.Edit} a={permissionSubject}>
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                isDisabled={!isAllowed}
                ariaLabel="Edit sync options"
                onClick={onEditOptions}
              >
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>
        <div>
          <div className="space-y-3">
            <GenericFieldLabel label="Certificate Import">
              <Badge variant={canImportCertificates ? "success" : "danger"}>
                {canImportCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </GenericFieldLabel>
            <GenericFieldLabel label="Certificate Removal">
              <Badge variant={canRemoveCertificates ? "success" : "danger"}>
                {canRemoveCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </GenericFieldLabel>
          </div>
        </div>
      </div>
    </div>
  );
};
