import { ReactNode } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { GenericFieldLabel } from "@app/components/secret-syncs";
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
          <GenericFieldLabel label="Organization">{destinationConfig.org}</GenericFieldLabel>
          <GenericFieldLabel label="Visibility" className="capitalize">
            {destinationConfig.visibility} Repositories
          </GenericFieldLabel>
          {destinationConfig.visibility === GitHubSyncVisibility.Selected && (
            <GenericFieldLabel label="Selected Repositories">
              {destinationConfig.selectedRepositoryIds?.length ?? 0} Repositories
              <Tooltip
                side="bottom"
                content={<GitHubSyncSelectedRepositoriesTooltipContent secretSync={secretSync} />}
              >
                <FontAwesomeIcon size="xs" className="text-bunker-300 ml-1" icon={faInfoCircle} />
              </Tooltip>
            </GenericFieldLabel>
          )}
        </>
      );
      break;
    case GitHubSyncScope.Repository:
      Components = (
        <GenericFieldLabel label="Repository">
          {destinationConfig.owner}/{destinationConfig.repo}
        </GenericFieldLabel>
      );
      break;
    case GitHubSyncScope.RepositoryEnvironment:
      Components = (
        <>
          <GenericFieldLabel label="Repository">
            {destinationConfig.owner}/{destinationConfig.repo}
          </GenericFieldLabel>
          <GenericFieldLabel label="Environment">{destinationConfig.env}</GenericFieldLabel>
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
      <GenericFieldLabel className="capitalize" label="Scope">
        {destinationConfig.scope.replace("-", " ")}
      </GenericFieldLabel>
      {Components}
    </>
  );
};
