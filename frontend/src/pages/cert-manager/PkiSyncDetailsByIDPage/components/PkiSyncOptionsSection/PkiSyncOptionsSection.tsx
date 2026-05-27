import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { TPkiSync, usePkiSyncPermissions } from "@app/hooks/api/pkiSyncs";

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
    syncOptions: { canRemoveCertificates: removeCertificatesEnabled }
  } = pkiSync;
  const { canEdit } = usePkiSyncPermissions(pkiSync);

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="text-lg font-medium text-mineshaft-100">Sync Options</h3>
          <IconButton
            variant="plain"
            colorSchema="secondary"
            isDisabled={!canEdit}
            ariaLabel="Edit sync options"
            onClick={onEditOptions}
          >
            <FontAwesomeIcon icon={faEdit} />
          </IconButton>
        </div>
        <div className="pt-1">
          <GenericFieldLabel label="Inactive Certificate Removal" labelClassName="mb-1">
            <Badge variant={removeCertificatesEnabled ? "success" : "danger"}>
              {removeCertificatesEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </GenericFieldLabel>
        </div>
      </div>
    </div>
  );
};
