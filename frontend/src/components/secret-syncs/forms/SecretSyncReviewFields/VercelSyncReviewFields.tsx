/* eslint-disable react/jsx-no-useless-fragment */
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
  const applyToAllCustomEnvironments = watch("destinationConfig.applyToAllCustomEnvironments");
  const targetProjects = watch("destinationConfig.targetProjects");
  const sensitive = watch("destinationConfig.sensitive");
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
            {targetEnvironments?.length ? (
              <DetailValue>
                {targetEnvironments
                  .map((env: string) => env.charAt(0).toUpperCase() + env.slice(1))
                  .join(", ")}
              </DetailValue>
            ) : (
              <DetailValue className="text-muted">—</DetailValue>
            )}
          </Detail>
          <Detail>
            <DetailLabel>All Custom Environments</DetailLabel>
            <DetailValue>{applyToAllCustomEnvironments ? "Yes" : "No"}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Target Projects</DetailLabel>
            <DetailValue>
              {selectedProjects?.map((project) => project?.name).join(", ")}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Sensitive</DetailLabel>
            <DetailValue>{sensitive ? "Yes" : "No"}</DetailValue>
          </Detail>
        </>
      ) : (
        <>
          <Detail>
            <DetailLabel>Scope</DetailLabel>
            <DetailValue>Project</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Vercel Project</DetailLabel>
            <DetailValue>{appName}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Environment</DetailLabel>
            <DetailValue>{envId}</DetailValue>
          </Detail>
          {envId === VercelEnvironmentType.Preview && branchId && (
            <Detail>
              <DetailLabel>Preview Branch</DetailLabel>
              <DetailValue>{branchId}</DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Sensitive</DetailLabel>
            <DetailValue>{sensitive ? "Yes" : "No"}</DetailValue>
          </Detail>
        </>
      )}
    </>
  );
};
