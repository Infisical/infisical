/* eslint-disable jsx-a11y/label-has-associated-control */
import { AlertTriangleIcon, PencilIcon } from "lucide-react";

import { Badge, IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TPkiSync, usePkiSyncPermissions } from "@app/hooks/api/pkiSyncs";

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
  const { canEdit } = usePkiSyncPermissions(pkiSync);

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-medium text-mineshaft-100">Source</h3>
          <div>
            {!subscriberId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="danger" className="mr-1">
                    <AlertTriangleIcon />
                    Source Deleted
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  The PKI subscriber for this sync has been deleted. Configure a new source or
                  remove this sync.
                </TooltipContent>
              </Tooltip>
            )}
            <IconButton
              variant="ghost-muted"
              size="xs"
              isDisabled={!canEdit}
              aria-label="Edit sync source"
              onClick={onEditSource}
            >
              <PencilIcon />
            </IconButton>
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
