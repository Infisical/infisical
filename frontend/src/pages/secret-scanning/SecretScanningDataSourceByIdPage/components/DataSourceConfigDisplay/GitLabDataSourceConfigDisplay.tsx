import { GenericFieldLabel } from "@app/components/v2";
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
        <GenericFieldLabel label="Scope" className="capitalize">
          {config.scope}
        </GenericFieldLabel>
        <GenericFieldLabel label="Project">{projectName || projectId}</GenericFieldLabel>
      </>
    );
  }

  // group-scope

  const { includeProjects, groupId, groupName } = config;

  return (
    <>
      <GenericFieldLabel label="Scope" className="capitalize">
        {config.scope}
      </GenericFieldLabel>
      <GenericFieldLabel label="Group">{groupName || groupId}</GenericFieldLabel>
      <GenericFieldLabel label="Scan Projects">
        {includeProjects.includes("*") ? "All" : includeProjects.join(", ")}
      </GenericFieldLabel>
    </>
  );
};
