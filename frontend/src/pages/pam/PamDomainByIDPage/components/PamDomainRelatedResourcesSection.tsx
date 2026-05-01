import { useNavigate, useParams } from "@tanstack/react-router";

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
import { PAM_RESOURCE_TYPE_MAP, PamResourceType } from "@app/hooks/api/pam";
import {
  PAM_DOMAIN_TYPE_MAP,
  TPamDomain,
  useListDomainRelatedResources
} from "@app/hooks/api/pamDomain";

type Props = {
  domain: TPamDomain;
};

export const PamDomainRelatedResourcesSection = ({ domain }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;

  const { data: relatedResources, isPending } = useListDomainRelatedResources(
    domain.domainType,
    domain.id
  );

  const resources = relatedResources || [];
  const domainTypeInfo = PAM_DOMAIN_TYPE_MAP[domain.domainType as keyof typeof PAM_DOMAIN_TYPE_MAP];

  return (
    <div className="rounded-lg border border-border bg-container">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-lg font-medium">Domain Resources</h3>
        <p className="text-sm text-muted">
          Resources that belong to this {domainTypeInfo?.name || domain.domainType} domain
        </p>
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
            {!isPending && resources.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>
                  <Empty className="border-0 bg-transparent py-8 shadow-none">
                    <EmptyHeader>
                      <EmptyTitle>No domain resources found</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
            {!isPending &&
              resources.map((resource) => {
                const typeInfo = PAM_RESOURCE_TYPE_MAP[resource.resourceType as PamResourceType];
                return (
                  <TableRow
                    key={resource.id}
                    className="group cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
                        params: {
                          orgId: currentOrg.id,
                          projectId: projectId!,
                          resourceType: resource.resourceType,
                          resourceId: resource.id
                        }
                      })
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {typeInfo?.image && (
                          <img
                            alt={typeInfo.name}
                            src={`/images/integrations/${typeInfo.image}`}
                            className="size-5"
                          />
                        )}
                        <span className="font-medium">{resource.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted">
                      {typeInfo?.name || resource.resourceType}
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
