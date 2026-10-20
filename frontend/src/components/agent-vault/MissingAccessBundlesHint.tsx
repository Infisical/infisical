import { Link } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { Badge, HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAgentVaultMissingAccessBundle } from "@app/hooks/api/agentVault/types";

type Props = {
  bundles: TAgentVaultMissingAccessBundle[];
  machineIdentityName: string;
  // Finishes "Sessions on behalf of ...", so it names who the sessions are for.
  onBehalfOf: string;
};

// An admin can leave bundles out of a delegation on purpose, so this informs rather than warns.
export const MissingAccessBundlesHint = ({ bundles, machineIdentityName, onBehalfOf }: Props) => {
  const { currentOrg } = useOrganization();
  if (!bundles.length) return null;

  const label = `${bundles.length} ${bundles.length === 1 ? "bundle" : "bundles"} excluded`;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs leading-4 text-muted outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <PackageIcon className="size-3" />
          <span className="underline decoration-dotted underline-offset-2">{label}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="flex w-80 flex-col gap-2.5">
        <p className="text-xs text-muted">
          {`Sessions on behalf of ${onBehalfOf} can't use these access bundles, because "${machineIdentityName}" isn't granted them.`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {bundles.map((bundle) => (
            <Badge key={bundle.id} variant="neutral" iconPosition="left" asChild>
              <Link
                to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                params={{ orgId: currentOrg.id, accessBundleId: bundle.id }}
              >
                <PackageIcon />
                {bundle.name}
              </Link>
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted">
          {`To include one, grant it to "${machineIdentityName}" from the bundle's Manage Access.`}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
};
