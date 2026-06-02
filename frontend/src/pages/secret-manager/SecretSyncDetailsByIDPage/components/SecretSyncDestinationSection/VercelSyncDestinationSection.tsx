import { ReactNode, useMemo } from "react";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
        <Detail>
          <DetailLabel>Scope</DetailLabel>
          <DetailValue>Team</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Vercel Team</DetailLabel>
          <DetailValue>{selectedTeam?.name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Target Environments</DetailLabel>
          <DetailValue>
            {destinationConfig.targetEnvironments?.length
              ? destinationConfig.targetEnvironments
                  .map((env) => env.charAt(0).toUpperCase() + env.slice(1))
                  .join(", ")
              : "None"}
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>All Custom Environments</DetailLabel>
          <DetailValue>{destinationConfig.applyToAllCustomEnvironments ? "Yes" : "No"}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Target Projects</DetailLabel>
          <DetailValue>{selectedProjects?.map((project) => project?.name).join(", ")}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Sensitive</DetailLabel>
          <DetailValue>{destinationConfig.sensitive ? "Yes" : "No"}</DetailValue>
        </Detail>
      </>
    );
  }

  let Components: ReactNode;
  if (destinationConfig.env === VercelEnvironmentType.Preview && destinationConfig.branch) {
    Components = (
      <>
        <Detail>
          <DetailLabel>Scope</DetailLabel>
          <DetailValue>Project</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Vercel Project</DetailLabel>
          <DetailValue>{destinationConfig.appName || destinationConfig.app}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Environment</DetailLabel>
          <DetailValue>{destinationConfig.env}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Preview Branch</DetailLabel>
          <DetailValue>{destinationConfig.branch}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Sensitive</DetailLabel>
          <DetailValue>{destinationConfig.sensitive ? "Yes" : "No"}</DetailValue>
        </Detail>
      </>
    );
  } else {
    Components = (
      <>
        <Detail>
          <DetailLabel>Scope</DetailLabel>
          <DetailValue>Project</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Vercel Project</DetailLabel>
          <DetailValue>{destinationConfig.appName || destinationConfig.app}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Environment</DetailLabel>
          <DetailValue>{destinationConfig.env}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Sensitive</DetailLabel>
          <DetailValue>{destinationConfig.sensitive ? "Yes" : "No"}</DetailValue>
        </Detail>
      </>
    );
  }

  return Components;
};
