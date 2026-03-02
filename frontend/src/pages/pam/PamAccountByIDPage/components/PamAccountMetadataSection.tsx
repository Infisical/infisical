import { PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Badge, UnstableIconButton } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  onEdit: VoidFunction;
};

export const PamAccountMetadataSection = ({ account, onEdit }: Props) => {
  const metadata = account.metadata || [];

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Metadata</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Edit}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      {metadata.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {metadata.map((item) => (
            <Badge key={`${item.key}=${item.value}`} variant="neutral">
              {item.key}
              {item.value ? `: ${item.value}` : ""}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-mineshaft-400">No metadata attached to this account.</p>
      )}
    </div>
  );
};
