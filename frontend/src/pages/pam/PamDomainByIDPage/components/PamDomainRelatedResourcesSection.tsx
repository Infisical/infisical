import { useNavigate, useParams } from "@tanstack/react-router";

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
            {!isPending && resources.length === 0 && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={2}>
                  <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                    <UnstableEmptyHeader>
                      <UnstableEmptyTitle>No domain resources found</UnstableEmptyTitle>
                    </UnstableEmptyHeader>
                  </UnstableEmpty>
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isPending &&
              resources.map((resource) => {
                const typeInfo = PAM_RESOURCE_TYPE_MAP[resource.resourceType as PamResourceType];
                return (
                  <UnstableTableRow
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
                    <UnstableTableCell>
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
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted">
                      {typeInfo?.name || resource.resourceType}
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
