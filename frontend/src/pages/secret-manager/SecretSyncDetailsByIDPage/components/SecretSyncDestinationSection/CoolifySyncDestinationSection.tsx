import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TCoolifySync } from "@app/hooks/api/secretSyncs/types/coolify-sync";

type Props = {
  secretSync: TCoolifySync;
};

export const CoolifySyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { appId }
  } = secretSync;

  return <GenericFieldLabel label="Application ID">{appId}</GenericFieldLabel>;
};
