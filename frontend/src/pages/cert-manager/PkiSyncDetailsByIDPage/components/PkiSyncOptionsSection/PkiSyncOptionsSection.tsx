import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

const GenericFieldLabel = ({
  label,
  children,
  labelClassName
}: {
  label: string;
  children: React.ReactNode;
  labelClassName?: string;
}) => (
  <div className="mb-4">
    <p className={`text-sm font-medium text-mineshaft-300 ${labelClassName || ""}`}>{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
  onEditOptions: VoidFunction;
};

export const PkiSyncOptionsSection = ({ pkiSync, onEditOptions }: Props) => {
  const {
    syncOptions: { canRemoveCertificates }
  } = pkiSync;

  const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberName: destinationName,
    name: pkiSync.name
  });

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="text-lg font-medium text-mineshaft-100">Sync Options</h3>
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
        <div className="pt-1">
          {/* Hidden for now - Import certificates functionality disabled
            <GenericFieldLabel label="Certificate Import">
              <Badge variant={canImportCertificates ? "success" : "danger"}>
                {canImportCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </GenericFieldLabel>
            */}
          <GenericFieldLabel label="Inactive Certificate Removal" labelClassName="mb-1">
            <Badge variant={canRemoveCertificates ? "success" : "danger"}>
              {canRemoveCertificates ? "Enabled" : "Disabled"}
            </Badge>
          </GenericFieldLabel>
        </div>
      </div>
    </div>
  );
};
