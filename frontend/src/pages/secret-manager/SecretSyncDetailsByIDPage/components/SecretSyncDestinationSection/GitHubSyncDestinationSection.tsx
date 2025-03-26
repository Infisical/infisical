import { ReactNode } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { GitHubSyncSelectedRepositoriesTooltipContent } from "@app/components/secret-syncs/github";
import { Tooltip } from "@app/components/v2";
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
          <SecretSyncLabel label="Organization">{destinationConfig.org}</SecretSyncLabel>
          <SecretSyncLabel label="Visibility" className="capitalize">
            {destinationConfig.visibility} Repositories
          </SecretSyncLabel>
          {destinationConfig.visibility === GitHubSyncVisibility.Selected && (
            <SecretSyncLabel label="Selected Repositories">
              {destinationConfig.selectedRepositoryIds?.length ?? 0} Repositories
              <Tooltip
                side="bottom"
                content={<GitHubSyncSelectedRepositoriesTooltipContent secretSync={secretSync} />}
              >
                <FontAwesomeIcon size="xs" className="ml-1 text-bunker-300" icon={faInfoCircle} />
              </Tooltip>
            </SecretSyncLabel>
          )}
        </>
      );
      break;
    case GitHubSyncScope.Repository:
      Components = (
        <SecretSyncLabel label="Repository">
          {destinationConfig.owner}/{destinationConfig.repo}
        </SecretSyncLabel>
      );
      break;
    case GitHubSyncScope.RepositoryEnvironment:
      Components = (
        <>
          <SecretSyncLabel label="Repository">
            {destinationConfig.owner}/{destinationConfig.repo}
          </SecretSyncLabel>
          <SecretSyncLabel label="Environment">{destinationConfig.env}</SecretSyncLabel>
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
      <SecretSyncLabel className="capitalize" label="Scope">
        {destinationConfig.scope.replace("-", " ")}
      </SecretSyncLabel>
      {Components}
    </>
  );
};
