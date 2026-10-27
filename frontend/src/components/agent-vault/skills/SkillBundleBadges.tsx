import { linkOptions } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { OverflowBadgeList } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";

export const SkillBundleBadges = ({
  accessBundles
}: {
  accessBundles: TAgentVaultSkill["accessBundles"];
}) => {
  const { currentOrg } = useOrganization();

  if (accessBundles.length === 0) return <span className="text-sm text-muted">Unused</span>;

  return (
    <OverflowBadgeList
      items={accessBundles}
      getKey={(bundle) => bundle.id}
      getLabel={(bundle) => bundle.name}
      icon={<PackageIcon />}
      getLinkProps={(bundle) =>
        linkOptions({
          to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
          params: { orgId: currentOrg.id, accessBundleId: bundle.id }
        })
      }
    />
  );
};
