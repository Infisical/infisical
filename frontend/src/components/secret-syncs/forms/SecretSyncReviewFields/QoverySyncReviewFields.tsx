import { useFormContext } from "react-hook-form";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { QoveryVariableType } from "@app/hooks/api/secretSyncs/types/qovery-sync";

import { TSecretSyncForm } from "../schemas";

export const QoverySyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Qovery }>();

  const organizationName = watch("destinationConfig.organizationName");
  const projectName = watch("destinationConfig.projectName");
  const environmentId = watch("destinationConfig.environmentId");
  const environmentName = watch("destinationConfig.environmentName");
  const variableType = watch("destinationConfig.variableType");

  return (
    <>
      <Detail>
        <DetailLabel>Organization</DetailLabel>
        <DetailValue>{organizationName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{environmentId ? `Environment (${environmentName})` : "Project"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Variable Type</DetailLabel>
        <DetailValue>
          {variableType === QoveryVariableType.Variable
            ? "Environment Variable"
            : "Environment Secret"}
        </DetailValue>
      </Detail>
    </>
  );
};
