import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TOvhSync } from "@app/hooks/api/secretSyncs/types/ovh-sync";

type Props = {
  secretSync: TOvhSync;
};

export const OvhSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { path }
  } = secretSync;

  return <GenericFieldLabel label="Path">{path}</GenericFieldLabel>;
};
