import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TerraformCloudSyncScope } from "@app/hooks/api/appConnections/terraform-cloud";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TerraformCloudSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.TerraformCloud }>();
  const orgId = watch("destinationConfig.org");
  const variableSetName = watch("destinationConfig.variableSetName");
  const workspaceName = watch("destinationConfig.workspaceName");
  const scope = watch("destinationConfig.scope");
  const category = watch("destinationConfig.category");

  return (
    <>
      <Detail>
        <DetailLabel>Organization</DetailLabel>
        <DetailValue>{orgId}</DetailValue>
      </Detail>
      {scope === TerraformCloudSyncScope.VariableSet && (
        <Detail>
          <DetailLabel>Variable Set</DetailLabel>
          <DetailValue>{variableSetName}</DetailValue>
        </Detail>
      )}
      {scope === TerraformCloudSyncScope.Workspace && (
        <Detail>
          <DetailLabel>Workspace</DetailLabel>
          <DetailValue>{workspaceName}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Category</DetailLabel>
        <DetailValue>{category}</DetailValue>
      </Detail>
    </>
  );
};
