import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useRailwayConnectionListProjects } from "@app/hooks/api/appConnections/railway";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const RailwaySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Railway }>();
  const connectionId = watch("connection.id");
  const projectId = watch("destinationConfig.projectId");
  const environmentId = watch("destinationConfig.environmentId");

  const { data: projects = [] } = useRailwayConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  const project = projects.find((p) => p.id === projectId);
  const environment = project?.environments.find((e) => e.id === environmentId);

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{project?.name ?? projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environment?.name ?? environmentId}</DetailValue>
      </Detail>
    </>
  );
};
