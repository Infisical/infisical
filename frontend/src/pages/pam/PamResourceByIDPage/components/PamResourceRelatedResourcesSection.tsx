import { useNavigate, useParams } from "@tanstack/react-router";
import { MonitorIcon } from "lucide-react";

import {
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { PAM_RESOURCE_TYPE_MAP, TPamResource, useListRelatedResources } from "@app/hooks/api/pam";

type Props = {
  resource: TPamResource;
};

export const PamResourceRelatedResourcesSection = ({ resource }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;

  const { data: relatedResources, isPending } = useListRelatedResources(resource.id);

  const handleResourceClick = (relatedResource: TPamResource) => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
      params: {
        orgId: currentOrg.id,
        projectId: projectId!,
        resourceType: relatedResource.resourceType,
        resourceId: relatedResource.id
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-container">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-lg font-medium">Related Resources</h3>
        <p className="text-sm text-muted">Resources that belong to this Active Directory domain</p>
      </div>
      <div className="p-4">
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Resource</UnstableTableHead>
              <UnstableTableHead>Type</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {isPending && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={2} className="text-center text-muted">
                  Loading resources...
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isPending && (!relatedResources || relatedResources.length === 0) && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={2}>
                  <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                    <UnstableEmptyHeader>
                      <UnstableEmptyTitle>No related resources found</UnstableEmptyTitle>
                    </UnstableEmptyHeader>
                  </UnstableEmpty>
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {relatedResources?.map((relatedResource) => {
              const typeInfo = PAM_RESOURCE_TYPE_MAP[relatedResource.resourceType];
              return (
                <UnstableTableRow
                  key={relatedResource.id}
                  className="group cursor-pointer"
                  onClick={() => handleResourceClick(relatedResource)}
                >
                  <UnstableTableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-foreground/5">
                        {typeInfo ? (
                          <img
                            alt={typeInfo.name}
                            src={`/images/integrations/${typeInfo.image}`}
                            className="size-4"
                          />
                        ) : (
                          <MonitorIcon className="size-4 text-muted" />
                        )}
                      </div>
                      <span className="font-medium">{relatedResource.name}</span>
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <span className="text-sm text-muted">
                      {typeInfo?.name ?? relatedResource.resourceType}
                    </span>
                  </UnstableTableCell>
                </UnstableTableRow>
              );
            })}
          </UnstableTableBody>
        </UnstableTable>
      </div>
    </div>
  );
};
