import { Link } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

type TUsage = TAgentVaultVariable["usedBy"][number];

type TBundleUsage = {
  accessBundleId: string;
  accessBundleName: string;
  services: TUsage[];
};

const DEFAULT_MAX_VISIBLE = 2;

const groupByBundle = (usedBy: TUsage[]): TBundleUsage[] => {
  const byBundle = new Map<string, TBundleUsage>();
  usedBy.forEach((usage) => {
    const bundle = byBundle.get(usage.accessBundleId) ?? {
      accessBundleId: usage.accessBundleId,
      accessBundleName: usage.accessBundleName,
      services: []
    };
    bundle.services.push(usage);
    byBundle.set(usage.accessBundleId, bundle);
  });
  return [...byBundle.values()].sort((a, b) =>
    a.accessBundleName.localeCompare(b.accessBundleName)
  );
};

const BundleBadge = ({ bundle }: { bundle: TBundleUsage }) => {
  const { currentOrg } = useOrganization();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="neutral" isTruncatable className="max-w-[10rem]" asChild>
          <Link
            to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
            params={{ orgId: currentOrg.id, accessBundleId: bundle.accessBundleId }}
          >
            <PackageIcon />
            <span>{bundle.accessBundleName}</span>
          </Link>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="mb-2 break-all text-muted">{bundle.accessBundleName}</p>
        <ul className="flex flex-col gap-1.5">
          {bundle.services.map((service) => (
            <li key={service.id} className="flex items-center gap-2">
              <ServiceIcon hostPattern={service.hostPattern} className="size-5" />
              <span className="truncate">{service.name}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};

export const UsedByBundleBadges = ({
  usedBy,
  maxVisible = DEFAULT_MAX_VISIBLE
}: {
  usedBy: TUsage[];
  maxVisible?: number;
}) => {
  if (usedBy.length === 0) return <span className="text-sm text-muted">Unused</span>;

  const bundles = groupByBundle(usedBy);
  const visible = bundles.slice(0, maxVisible);
  const overflow = bundles.slice(maxVisible);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {visible.map((bundle) => (
        <BundleBadge key={bundle.accessBundleId} bundle={bundle} />
      ))}
      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Badge variant="neutral" asChild>
              <button type="button">+{overflow.length} more</button>
            </Badge>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="flex flex-wrap gap-1.5">
            {overflow.map((bundle) => (
              <BundleBadge key={bundle.accessBundleId} bundle={bundle} />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
