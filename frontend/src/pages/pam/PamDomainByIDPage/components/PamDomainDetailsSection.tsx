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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { TPamDomain } from "@app/hooks/api/pamDomain";

type Props = {
  domain: TPamDomain;
  onEdit: VoidFunction;
};

export const PamDomainDetailsSection = ({ domain, onEdit }: Props) => {
  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Details</h3>
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.PamDomains}>
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
          <DetailValue>{domain.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Created</DetailLabel>
          <DetailValue>{format(new Date(domain.createdAt), "MM/dd/yyyy, hh:mm a")}</DetailValue>
        </Detail>
      </DetailGroup>
    </div>
  );
};
