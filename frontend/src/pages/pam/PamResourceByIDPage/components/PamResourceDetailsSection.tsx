import { Link, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import { TPamResource } from "@app/hooks/api/pam";
import { PamDomainType, useGetPamDomainById } from "@app/hooks/api/pamDomain";

type Props = {
  resource: TPamResource;
  onEdit: VoidFunction;
};

export const PamResourceDetailsSection = ({ resource, onEdit }: Props) => {
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;

  const { data: domain } = useGetPamDomainById(
    PamDomainType.ActiveDirectory,
    resource.domainId || undefined,
    { enabled: !!resource.domainId }
  );

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={ProjectPermissionSub.PamResources}
        >
          {(isAllowed) => (
            <IconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <DetailGroup>
        <Detail>
          <DetailLabel>Name</DetailLabel>
          <DetailValue>{resource.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Created</DetailLabel>
          <DetailValue>{format(new Date(resource.createdAt), "MM/dd/yyyy, hh:mm a")}</DetailValue>
        </Detail>
        {resource.domainId && domain && (
          <Detail>
            <DetailLabel>Joined domain</DetailLabel>
            <DetailValue>
              <Link
                to="/organizations/$orgId/projects/pam/$projectId/domains/$domainType/$domainId"
                params={{
                  orgId: currentOrg.id,
                  projectId: projectId!,
                  domainType: domain.domainType,
                  domainId: domain.id
                }}
              >
                <Badge variant="info" className="text-xs">
                  {domain.connectionDetails.domain}
                </Badge>
              </Link>
            </DetailValue>
          </Detail>
        )}
      </DetailGroup>
    </div>
  );
};
