import { SecretSyncLabel } from "@app/components/secret-syncs";
import { THumanitecSync } from "@app/hooks/api/secretSyncs/types/humanitec-sync";

type Props = {
  secretSync: THumanitecSync;
};

export const HumanitecSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { app, org }
  } = secretSync;

  return (
    <>
      <SecretSyncLabel label="App">{app}</SecretSyncLabel>
      <SecretSyncLabel label="Org">{org}</SecretSyncLabel>
    </>
  );
};
