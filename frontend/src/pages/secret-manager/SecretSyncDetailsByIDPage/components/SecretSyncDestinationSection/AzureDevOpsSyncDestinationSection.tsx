import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TAzureDevOpsSync } from "@app/hooks/api/secretSyncs/types/azure-devops-sync";

type Props = {
  secretSync: TAzureDevOpsSync;
};

export const AzureDevOpsSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { devopsProjectName, devopsProjectId }
  } = secretSync;

  return (
    <GenericFieldLabel label={devopsProjectName ? "Project" : "Project ID"}>
      {devopsProjectName || devopsProjectId}
    </GenericFieldLabel>
  );
};
