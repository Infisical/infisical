import { AlertTriangle } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

// Purely informational: staleness means the discovery source's latest scan didn't find the account. It is
// deliberately not an accessibility issue, so rotation, session launch, and everything else are unaffected.
export const AccountStaleBadge = ({ isStale }: { isStale: boolean }) => {
  if (!isStale) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="neutral">
          <AlertTriangle className="size-3" />
          Stale
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          The latest discovery scan didn&apos;t find this account in the environment. It still works
          normally, including rotation and access, so delete it if it&apos;s really gone.
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
