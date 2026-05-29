import { ReactNode } from "react";
import { InfoIcon } from "lucide-react";

import { GitHubSyncSelectedRepositoriesTooltipContent } from "@app/components/secret-syncs/github";
import {
  Detail,
  DetailLabel,
  DetailValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  GitHubSyncScope,
  GitHubSyncVisibility,
  TGitHubSync
} from "@app/hooks/api/secretSyncs/types/github-sync";

type Props = {
  secretSync: TGitHubSync;
};

export const GitHubSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  let Components: ReactNode;
  switch (destinationConfig.scope) {
    case GitHubSyncScope.Organization:
      Components = (
        <>
          <Detail>
            <DetailLabel>Organization</DetailLabel>
            <DetailValue>{destinationConfig.org}</DetailValue>
          </Detail>
          <Detail className="capitalize">
            <DetailLabel>Visibility</DetailLabel>
            <DetailValue>{destinationConfig.visibility} Repositories</DetailValue>
          </Detail>
          {destinationConfig.visibility === GitHubSyncVisibility.Selected && (
            <Detail>
              <DetailLabel>Selected Repositories</DetailLabel>
              <DetailValue>
                {destinationConfig.selectedRepositoryIds?.length ?? 0} Repositories
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="ml-1 inline size-3 text-bunker-300" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <GitHubSyncSelectedRepositoriesTooltipContent secretSync={secretSync} />
                  </TooltipContent>
                </Tooltip>
              </DetailValue>
            </Detail>
          )}
        </>
      );
      break;
    case GitHubSyncScope.Repository:
      Components = (
        <Detail>
          <DetailLabel>Repository</DetailLabel>
          <DetailValue>
            {destinationConfig.owner}/{destinationConfig.repo}
          </DetailValue>
        </Detail>
      );
      break;
    case GitHubSyncScope.RepositoryEnvironment:
      Components = (
        <>
          <Detail>
            <DetailLabel>Repository</DetailLabel>
            <DetailValue>
              {destinationConfig.owner}/{destinationConfig.repo}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Environment</DetailLabel>
            <DetailValue>{destinationConfig.env}</DetailValue>
          </Detail>
        </>
      );
      break;
    default:
      throw new Error(
        `Uhandled GitHub Sync Destination Section Scope ${secretSync.destinationConfig.scope}`
      );
  }

  return (
    <>
      <Detail className="capitalize">
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{destinationConfig.scope.replace("-", " ")}</DetailValue>
      </Detail>
      {Components}
    </>
  );
};
