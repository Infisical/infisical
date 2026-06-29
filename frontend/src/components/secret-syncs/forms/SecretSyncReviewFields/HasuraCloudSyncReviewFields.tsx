import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { useHasuraCloudConnectionListProjects } from "@app/hooks/api/appConnections/hasura-cloud";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HasuraCloudSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.HasuraCloud }>();
  const connectionId = watch("connection.id");
  const projectId = watch("destinationConfig.projectId");
  const tenantId = watch("destinationConfig.tenantId");

  const { data: projects = [] } = useHasuraCloudConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  const project = projects.find((p) => p.id === projectId);

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{project?.name ?? projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Tenant</DetailLabel>
        <DetailValue>{tenantId}</DetailValue>
      </Detail>
    </>
  );
};
