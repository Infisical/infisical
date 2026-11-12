import { TAgentVaultSessionStats } from "@app/hooks/api/agentVault/types";

type Props = {
  stats: TAgentVaultSessionStats;
};

export const SessionRequestCount = ({ stats }: Props) => (
  <span className="whitespace-nowrap">
    {stats.requests.toLocaleString()}
    {stats.brokered !== null && ` (${stats.brokered.toLocaleString()} brokered)`}
  </span>
);
