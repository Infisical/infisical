import { linkOptions } from "@tanstack/react-router";

import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import { OverflowBadgeList } from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { TAgentVaultVariableUsedByService } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const ServiceBundles = ({ service }: { service: TAgentVaultVariableUsedByService }) => {
  const bundles = service.accessBundles ?? [];
  return (
    <p className="break-all text-muted">
      {bundles.length
        ? `In ${bundles.map((bundle) => bundle.name).join(", ")}`
        : "Not in an access bundle yet"}
    </p>
  );
};

const renderServiceIcon = (service: TAgentVaultVariableUsedByService) => (
  <ServiceIcon hostPattern={service.hostPattern} serviceType={service.type} className="size-4" />
);

const renderServiceBundles = (service: TAgentVaultVariableUsedByService) => (
  <ServiceBundles service={service} />
);

export const UsedByServiceBadges = ({
  usedByServices
}: {
  usedByServices: TAgentVaultVariableUsedByService[];
}) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  // The Services page is an admin's, so a member's badges don't link to it.
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  if (usedByServices.length === 0) return <span className="text-sm text-muted">Unused</span>;

  return (
    <OverflowBadgeList
      items={usedByServices}
      getKey={(service) => service.id}
      getLabel={(service) => service.name}
      getIcon={renderServiceIcon}
      getTooltip={renderServiceBundles}
      getLinkProps={() =>
        isAdmin
          ? linkOptions({
              to: "/organizations/$orgId/projects/agent-vault/$projectId/services",
              params: { orgId: currentOrg.id, projectId }
            })
          : undefined
      }
    />
  );
};
