import { GitHubSyncSelectedRepositoriesTooltipContent } from "@app/components/secret-syncs/github";
import {
  GitHubSyncScope,
  GitHubSyncVisibility,
  TGitHubSync
} from "@app/hooks/api/secretSyncs/types/github-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell, SecretSyncTableCellProps } from "../SecretSyncTableCell";

type Props = {
  secretSync: TGitHubSync;
};

export const GitHubSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  const { destinationConfig } = secretSync;

  let additionalProps: Pick<
    SecretSyncTableCellProps,
    "additionalTooltipContent" | "infoBadge" | "secondaryClassName"
  > = {};

  if (
    destinationConfig.scope === GitHubSyncScope.Organization &&
    destinationConfig.visibility === GitHubSyncVisibility.Selected
  ) {
    additionalProps = {
      infoBadge: "secondary",
      additionalTooltipContent: (
        <div className="mt-4">
          <GitHubSyncSelectedRepositoriesTooltipContent secretSync={secretSync} />
        </div>
      )
    };
  }

  return (
    <SecretSyncTableCell
      primaryText={primaryText}
      secondaryText={secondaryText}
      {...additionalProps}
      secondaryClassName={
        destinationConfig.scope === GitHubSyncScope.Organization ? "capitalize" : undefined
      }
    />
  );
};
