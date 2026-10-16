import { useMemo } from "react";
import { linkOptions } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import { OverflowBadgeList } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAgentVaultVariableUsedByService } from "@app/hooks/api/agentVault/types";

type TBundleUsage = {
  accessBundleId: string;
  accessBundleName: string;
  services: TAgentVaultVariableUsedByService[];
};

const groupByBundle = (usedByServices: TAgentVaultVariableUsedByService[]): TBundleUsage[] => {
  const byBundle = new Map<string, TBundleUsage>();
  usedByServices.forEach((service) => {
    const bundle = byBundle.get(service.accessBundleId) ?? {
      accessBundleId: service.accessBundleId,
      accessBundleName: service.accessBundleName,
      services: []
    };
    bundle.services.push(service);
    byBundle.set(service.accessBundleId, bundle);
  });
  return [...byBundle.values()].sort((a, b) =>
    a.accessBundleName.localeCompare(b.accessBundleName)
  );
};

const BundleServices = ({ bundle }: { bundle: TBundleUsage }) => (
  <>
    <p className="mb-2 break-all text-muted">{bundle.accessBundleName}</p>
    <ul className="flex flex-col gap-1.5">
      {bundle.services.map((service) => (
        <li key={service.id} className="flex items-center gap-2">
          <ServiceIcon hostPattern={service.hostPattern} className="size-5" />
          <span className="truncate">{service.name}</span>
        </li>
      ))}
    </ul>
  </>
);

const renderBundleServices = (bundle: TBundleUsage) => <BundleServices bundle={bundle} />;

export const UsedByBundleBadges = ({
  usedByServices
}: {
  usedByServices: TAgentVaultVariableUsedByService[];
}) => {
  const { currentOrg } = useOrganization();
  const bundles = useMemo(() => groupByBundle(usedByServices), [usedByServices]);

  if (bundles.length === 0) return <span className="text-sm text-muted">Unused</span>;

  return (
    <OverflowBadgeList
      items={bundles}
      getKey={(bundle) => bundle.accessBundleId}
      getLabel={(bundle) => bundle.accessBundleName}
      icon={<PackageIcon />}
      getTooltip={renderBundleServices}
      getLinkProps={(bundle) =>
        linkOptions({
          to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
          params: { orgId: currentOrg.id, accessBundleId: bundle.accessBundleId }
        })
      }
    />
  );
};
