import { twMerge } from "tailwind-merge";

import { useGitHubConnectionListRepositories } from "@app/hooks/api/appConnections/github";
import { GitHubSyncScope, TGitHubSync } from "@app/hooks/api/secretSyncs/types/github-sync";

type Props = {
  secretSync: TGitHubSync;
};

export const GitHubSyncSelectedRepositoriesTooltipContent = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  const showRepositories =
    destinationConfig.scope === GitHubSyncScope.Organization &&
    Boolean(destinationConfig.selectedRepositoryIds?.length);

  const { data: repositories, isPending } = useGitHubConnectionListRepositories(
    secretSync.connectionId,
    {
      enabled: showRepositories
    }
  );

  if (destinationConfig.scope === GitHubSyncScope.Organization) {
    return (
      <>
        <span className="text-xs text-bunker-300">Repositories:</span>
        <p className={twMerge("text-sm", isPending && "text-mineshaft-400")}>
          {isPending
            ? "Loading..."
            : repositories
                ?.filter((repo) => destinationConfig?.selectedRepositoryIds?.includes(repo.id))
                .map((repo) => repo.name)
                .join(", ")}
        </p>
      </>
    );
  }

  return null;
};
