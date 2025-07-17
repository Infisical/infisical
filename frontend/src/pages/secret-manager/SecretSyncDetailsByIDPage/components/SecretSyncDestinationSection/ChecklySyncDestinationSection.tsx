import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TChecklySync } from "@app/hooks/api/secretSyncs/types/checkly-sync";

type Props = {
  secretSync: TChecklySync;
};

export const ChecklySyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return <GenericFieldLabel label="Account">{destinationConfig.accountName}</GenericFieldLabel>;
};
