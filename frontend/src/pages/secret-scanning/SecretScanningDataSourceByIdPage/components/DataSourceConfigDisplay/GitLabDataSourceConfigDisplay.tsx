import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  GitLabDataSourceScope,
  TGitLabDataSource
} from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

type Props = {
  dataSource: TGitLabDataSource;
};

export const GitLabDataSourceConfigDisplay = ({ dataSource }: Props) => {
  const { config } = dataSource;

  if (config.scope === GitLabDataSourceScope.Project) {
    const { projectName, projectId } = config;
    return (
      <>
        <Detail>
          <DetailLabel>Scope</DetailLabel>
          <DetailValue className="capitalize">{config.scope}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Project</DetailLabel>
          <DetailValue>{projectName || projectId}</DetailValue>
        </Detail>
      </>
    );
  }

  return (
    <Detail>
      <DetailLabel>Group</DetailLabel>
      <DetailValue>
        {config.scope === GitLabDataSourceScope.Group
          ? config.groupName || config.groupId
          : "None (all accessible projects)"}
      </DetailValue>
    </Detail>
  );
};
