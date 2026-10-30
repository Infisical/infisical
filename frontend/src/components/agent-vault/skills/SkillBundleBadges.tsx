import { Link } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";

const MAX_VISIBLE = 3;

export const SkillBundleBadges = ({
  accessBundles
}: {
  accessBundles: TAgentVaultSkill["accessBundles"];
}) => {
  const { currentOrg } = useOrganization();

  if (accessBundles.length === 0) return <span className="text-sm text-muted">Unused</span>;

  const visible = accessBundles.slice(0, MAX_VISIBLE);
  const hidden = accessBundles.slice(MAX_VISIBLE);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {visible.map((bundle) => (
        <Tooltip key={bundle.id}>
          <TooltipTrigger asChild>
            <Badge variant="neutral" isTruncatable iconPosition="left" className="max-w-40" asChild>
              <Link
                to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                params={{ orgId: currentOrg.id, accessBundleId: bundle.id }}
              >
                <PackageIcon />
                <span>{bundle.name}</span>
              </Link>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{bundle.name}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild data-row-interactive>
            <span className="shrink-0 cursor-default text-xs text-muted">+{hidden.length}</span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col">
              {hidden.map((bundle) => (
                <span key={bundle.id}>{bundle.name}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
