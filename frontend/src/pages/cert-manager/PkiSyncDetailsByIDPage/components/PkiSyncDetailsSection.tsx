/* eslint-disable jsx-a11y/label-has-associated-control */
import { format } from "date-fns";
import { PencilIcon } from "lucide-react";

import { PkiSyncStatusBadge } from "@app/components/pki-syncs";
import { IconButton } from "@app/components/v3";
import { TPkiSync, usePkiSyncPermissions } from "@app/hooks/api/pkiSyncs";

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
    <div className={`text-sm text-mineshaft-400 ${truncate ? "truncate" : ""}`}>{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
  onEditDetails: VoidFunction;
};

export const PkiSyncDetailsSection = ({ pkiSync, onEditDetails }: Props) => {
  const { syncStatus, lastSyncedAt, name, description, subscriber } = pkiSync;

  const { canEdit } = usePkiSyncPermissions(pkiSync);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Details</h3>
        <IconButton
          variant="ghost-muted"
          size="xs"
          isDisabled={!canEdit}
          aria-label="Edit sync details"
          onClick={onEditDetails}
        >
          <PencilIcon />
        </IconButton>
      </div>
      <div className="pt-2">
        <GenericFieldLabel label="Name" truncate>
          {name}
        </GenericFieldLabel>
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
      </div>
    </div>
  );
};
