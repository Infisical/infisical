import { format } from "date-fns";
import { PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { PAM_RESOURCE_TYPE_MAP, TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  onEdit: VoidFunction;
};

export const PamAccountDetailsSection = ({ account, onEdit }: Props) => {
  const resourceTypeInfo = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Details</h3>
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
      <DetailGroup>
        <Detail>
          <DetailLabel>Name</DetailLabel>
          <DetailValue>{account.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Description</DetailLabel>
          <DetailValue>{account.description || "-"}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Type</DetailLabel>
          <DetailValue>
            <div className="flex items-center gap-2">
              <img
                alt={resourceTypeInfo.name}
                src={`/images/integrations/${resourceTypeInfo.image}`}
                className="size-4"
              />
              {resourceTypeInfo.name} Account
            </div>
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Parent Resource</DetailLabel>
          <DetailValue>{account.resource.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Created</DetailLabel>
          <DetailValue>{format(new Date(account.createdAt), "MM/dd/yyyy, hh:mm a")}</DetailValue>
        </Detail>
      </DetailGroup>
    </div>
  );
};
