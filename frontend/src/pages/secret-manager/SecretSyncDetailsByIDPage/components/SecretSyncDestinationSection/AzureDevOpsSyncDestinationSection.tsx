import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TAzureDevOpsSync } from "@app/hooks/api/secretSyncs/types/azure-devops-sync";

type Props = {
  secretSync: TAzureDevOpsSync;
};

export const AzureDevOpsSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { devopsProjectName, devopsProjectId }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>{devopsProjectName ? "Project" : "Project ID"}</DetailLabel>
      <DetailValue>{devopsProjectName || devopsProjectId}</DetailValue>
    </Detail>
  );
};
