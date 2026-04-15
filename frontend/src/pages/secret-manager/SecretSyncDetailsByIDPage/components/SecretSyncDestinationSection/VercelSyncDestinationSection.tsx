import { ReactNode, useMemo } from "react";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { useVercelConnectionListOrganizations } from "@app/hooks/api/appConnections/vercel";
import {
  TVercelSync,
  VercelEnvironmentType,
  VercelSyncScope
} from "@app/hooks/api/secretSyncs/types/vercel-sync";

type Props = {
  secretSync: TVercelSync;
};

export const VercelSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  const { data: teams } = useVercelConnectionListOrganizations(
    secretSync.connection.id,
    undefined,
    {
      enabled: secretSync.destinationConfig.scope === VercelSyncScope.Team
    }
  );

  const selectedTeam = useMemo(() => {
    if (secretSync.destinationConfig.scope !== VercelSyncScope.Team) return undefined;

    return teams?.find((team) => team.id === secretSync.destinationConfig.teamId);
  }, [teams, secretSync.destinationConfig.teamId]);

  const selectedProjects = useMemo(() => {
    if (secretSync.destinationConfig.scope !== VercelSyncScope.Team) return undefined;

    return secretSync.destinationConfig.targetProjects?.map((projectId) =>
      selectedTeam?.apps.find((app) => app.id === projectId)
    );
  }, [selectedTeam, secretSync.destinationConfig]);

  if (destinationConfig.scope === VercelSyncScope.Team) {
    return (
      <>
        <GenericFieldLabel label="Scope">Team</GenericFieldLabel>
        <GenericFieldLabel label="Vercel Team">{selectedTeam?.name}</GenericFieldLabel>
        <GenericFieldLabel label="Target Environments">
          {destinationConfig.targetEnvironments?.join(", ")}
        </GenericFieldLabel>
        <GenericFieldLabel label="Target Projects">
          {selectedProjects?.map((project) => project?.name).join(", ")}
        </GenericFieldLabel>
      </>
    );
  }

  let Components: ReactNode;
  if (destinationConfig.env === VercelEnvironmentType.Preview && destinationConfig.branch) {
    Components = (
      <>
        <GenericFieldLabel label="Scope">Project</GenericFieldLabel>
        <GenericFieldLabel label="Vercel Project">
          {destinationConfig.appName || destinationConfig.app}
        </GenericFieldLabel>
        <GenericFieldLabel label="Environment">{destinationConfig.env}</GenericFieldLabel>
        <GenericFieldLabel label="Preview Branch">{destinationConfig.branch}</GenericFieldLabel>
      </>
    );
  } else {
    Components = (
      <>
        <GenericFieldLabel label="Scope">Project</GenericFieldLabel>
        <GenericFieldLabel label="Vercel Project">
          {destinationConfig.appName || destinationConfig.app}
        </GenericFieldLabel>
        <GenericFieldLabel label="Environment">{destinationConfig.env}</GenericFieldLabel>
      </>
    );
  }

  return Components;
};
