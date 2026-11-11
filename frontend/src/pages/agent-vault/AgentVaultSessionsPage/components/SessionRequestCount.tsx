import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { TAgentVaultSessionStats } from "@app/hooks/api/agentVault/types";

type Props = {
  stats: TAgentVaultSessionStats | null;
};

export const SessionRequestCount = ({ stats }: Props) => {
  if (!stats) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted">–</span>
        </TooltipTrigger>
        <TooltipContent>
          No requests counted. Counts come with session logs, so a session without them shows none.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className="whitespace-nowrap">
      {stats.requests.toLocaleString()}
      {stats.brokered !== null && ` (${stats.brokered.toLocaleString()} brokered)`}
    </span>
  );
};
