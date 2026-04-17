import { useNavigate, useParams } from "@tanstack/react-router";
import { MonitorIcon } from "lucide-react";

import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted">
                  Loading resources...
                </TableCell>
              </TableRow>
            )}
            {!isPending && (!relatedResources || relatedResources.length === 0) && (
              <TableRow>
                <TableCell colSpan={2}>
                  <Empty className="border-0 bg-transparent py-8 shadow-none">
                    <EmptyHeader>
                      <EmptyTitle>No related resources found</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {relatedResources?.map((relatedResource) => {
              const typeInfo = PAM_RESOURCE_TYPE_MAP[relatedResource.resourceType];
              return (
                <TableRow
                  key={relatedResource.id}
                  className="group cursor-pointer"
                  onClick={() => handleResourceClick(relatedResource)}
                >
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted">
                      {typeInfo?.name ?? relatedResource.resourceType}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
