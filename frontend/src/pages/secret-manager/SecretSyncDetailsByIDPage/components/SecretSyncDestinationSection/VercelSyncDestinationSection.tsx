import { ReactNode } from "react";

import { GenericFieldLabel } from "@app/components/secret-syncs";
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
        <GenericFieldLabel label="Vercel App">
          {destinationConfig.appName || destinationConfig.app}
        </GenericFieldLabel>
        <GenericFieldLabel label="Environment">{destinationConfig.env}</GenericFieldLabel>
        <GenericFieldLabel label="Preview Branch">{destinationConfig.branch}</GenericFieldLabel>
      </>
    );
  } else {
    Components = (
      <>
        <GenericFieldLabel label="Vercel App">
          {destinationConfig.appName || destinationConfig.app}
        </GenericFieldLabel>
        <GenericFieldLabel label="Environment">{destinationConfig.env}</GenericFieldLabel>
      </>
    );
  }

  return Components;
};
