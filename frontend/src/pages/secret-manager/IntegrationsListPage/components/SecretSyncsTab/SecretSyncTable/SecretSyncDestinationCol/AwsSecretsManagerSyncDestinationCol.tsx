import {
  AwsSecretsManagerSyncMappingBehavior,
  TAwsSecretsManagerSync
} from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell, SecretSyncTableCellProps } from "../SecretSyncTableCell";

type Props = {
  secretSync: TAwsSecretsManagerSync;
};

export const AwsSecretsManagerSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);

  const { destinationConfig } = secretSync;

  let additionalProps: Pick<
    SecretSyncTableCellProps,
    "additionalTooltipContent" | "infoBadge" | "secondaryClassName"
  > = {};

  if (destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne) {
    additionalProps = {
      infoBadge: "secondary",
      additionalTooltipContent: (
        <div className="mt-4">
          <span className="text-xs text-bunker-300">Secret Name:</span>
          <p className="text-sm">{destinationConfig.secretName}</p>
        </div>
      )
    };
  }

  return (
    <SecretSyncTableCell
      {...additionalProps}
      secondaryClassName="capitalize"
      primaryText={primaryText}
      secondaryText={secondaryText}
    />
  );
};
