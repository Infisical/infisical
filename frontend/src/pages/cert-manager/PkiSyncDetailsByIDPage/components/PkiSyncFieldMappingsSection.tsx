import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync, TPkiSync } from "@app/hooks/api/pkiSyncs";

const GenericFieldLabel = ({
  label,
  children,
  labelClassName
}: {
  label: string;
  children: React.ReactNode;
  labelClassName?: string;
}) => (
  <div className="mb-3">
    <p className={`mb-1 text-sm font-medium text-mineshaft-300 ${labelClassName || ""}`}>{label}</p>
    <div className="text-sm text-mineshaft-400">{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
  onEditMappings: VoidFunction;
};

export const PkiSyncFieldMappingsSection = ({ pkiSync, onEditMappings }: Props) => {
  if (pkiSync.destination !== PkiSync.Chef && pkiSync.destination !== PkiSync.AwsSecretsManager) {
    return null;
  }

  const fieldMappings = pkiSync.syncOptions?.fieldMappings;
  const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberName: destinationName,
    name: pkiSync.name
  });

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="text-lg font-medium text-mineshaft-100">Field Mappings</h3>
          <ProjectPermissionCan I={ProjectPermissionPkiSyncActions.Edit} a={permissionSubject}>
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                isDisabled={!isAllowed}
                ariaLabel="Edit field mappings"
                onClick={onEditMappings}
              >
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>
        <div className="pt-1">
          <div className="space-y-3">
            <GenericFieldLabel label="Certificate Field">
              <Badge variant="neutral" className="max-w-full truncate">
                {fieldMappings?.certificate || "certificate"}
              </Badge>
            </GenericFieldLabel>

            <GenericFieldLabel label="Private Key Field">
              <Badge variant="neutral" className="max-w-full truncate">
                {fieldMappings?.privateKey || "private_key"}
              </Badge>
            </GenericFieldLabel>

            <GenericFieldLabel label="Certificate Chain Field">
              <Badge variant="neutral" className="max-w-full truncate">
                {fieldMappings?.certificateChain || "certificate_chain"}
              </Badge>
            </GenericFieldLabel>

            <GenericFieldLabel label="CA Certificate Field">
              <Badge variant="neutral" className="max-w-full truncate">
                {fieldMappings?.caCertificate || "ca_certificate"}
              </Badge>
            </GenericFieldLabel>
          </div>
        </div>
      </div>
    </div>
  );
};
