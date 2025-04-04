import { ReactNode } from "react";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TVercelSync, VercelEnvironmentType } from "@app/hooks/api/secretSyncs/types/vercel-sync";

type Props = {
  secretSync: TVercelSync;
};

export const VercelSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  let Components: ReactNode;
  if (destinationConfig.env === VercelEnvironmentType.Preview && destinationConfig.branch) {
    Components = (
      <>
        <SecretSyncLabel label="Vercel App">{destinationConfig.app}</SecretSyncLabel>
        <SecretSyncLabel label="Environment">{destinationConfig.env}</SecretSyncLabel>
        <SecretSyncLabel label="Preview Branch">{destinationConfig.branch}</SecretSyncLabel>
      </>
    );
  } else {
    Components = (
      <>
        <SecretSyncLabel label="Vercel App">{destinationConfig.app}</SecretSyncLabel>
        <SecretSyncLabel label="Environment">{destinationConfig.env}</SecretSyncLabel>
      </>
    );
  }

  return Components;
};
