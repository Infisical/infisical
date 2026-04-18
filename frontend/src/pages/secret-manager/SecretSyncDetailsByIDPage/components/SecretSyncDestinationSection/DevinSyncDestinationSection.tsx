import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TDevinSync } from "@app/hooks/api/secretSyncs/types/devin-sync";

type Props = {
  secretSync: TDevinSync;
};

export const DevinSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return <GenericFieldLabel label="Organization ID">{destinationConfig.orgId}</GenericFieldLabel>;
};
