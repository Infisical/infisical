/* eslint-disable react/jsx-no-useless-fragment */
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { useVercelConnectionListOrganizations } from "@app/hooks/api/appConnections/vercel";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import {
  VercelEnvironmentType,
  VercelSyncScope
} from "@app/hooks/api/secretSyncs/types/vercel-sync";

export const VercelSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Vercel }>();
  const envId = watch("destinationConfig.env");
  const branchId = watch("destinationConfig.branch");
  const appName = watch("destinationConfig.appName");
  const scope = watch("destinationConfig.scope");
  const teamId = watch("destinationConfig.teamId");
  const targetEnvironments = watch("destinationConfig.targetEnvironments");
  const targetProjects = watch("destinationConfig.targetProjects");
  const connectionId = watch("connection.id");

  const { data: teams } = useVercelConnectionListOrganizations(connectionId, undefined, {
    enabled: scope === VercelSyncScope.Team
  });

  const selectedTeam = useMemo(() => {
    if (scope !== VercelSyncScope.Team) return undefined;

    return teams?.find((team) => team.id === teamId);
  }, [teams, teamId]);

  const selectedProjects = useMemo(() => {
    if (scope !== VercelSyncScope.Team) return undefined;

    return targetProjects?.map((projectId) =>
      selectedTeam?.apps.find((app) => app.id === projectId)
    );
  }, [selectedTeam, targetProjects]);

  return (
    <>
      {scope === VercelSyncScope.Team ? (
        <>
          <GenericFieldLabel label="Scope">Team</GenericFieldLabel>
          <GenericFieldLabel label="Vercel Team">{selectedTeam?.name}</GenericFieldLabel>
          <GenericFieldLabel label="Target Environments">
            {targetEnvironments?.join(", ")}
          </GenericFieldLabel>
          <GenericFieldLabel label="Target Projects">
            {selectedProjects?.map((project) => project?.name).join(", ")}
          </GenericFieldLabel>
        </>
      ) : (
        <>
          <GenericFieldLabel label="Scope">Project</GenericFieldLabel>
          <GenericFieldLabel label="Vercel Project">{appName}</GenericFieldLabel>
          <GenericFieldLabel label="Environment">{envId}</GenericFieldLabel>
          {envId === VercelEnvironmentType.Preview && branchId && (
            <GenericFieldLabel label="Preview Branch">{branchId}</GenericFieldLabel>
          )}
        </>
      )}
    </>
  );
};
