import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
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
      <GenericFieldLabel label="Project">{project?.name ?? projectId}</GenericFieldLabel>
      <GenericFieldLabel label="Environment">
        {environment?.name ?? environmentId}
      </GenericFieldLabel>
    </>
  );
};
