import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/v2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConfigReviewSection } from "./shared";

export const GitLabDataSourceReviewFields = () => {
  const { watch } = useFormContext<
    TSecretScanningDataSourceForm & {
      type: SecretScanningDataSource.GitLab;
    }
  >();

  const [config, connection] = watch(["config", "connection"]);

  if (config.scope === GitLabDataSourceScope.Project) {
    const { projectName, projectId } = config;
    return (
      <SecretScanningDataSourceConfigReviewSection>
        {connection && <GenericFieldLabel label="Connection">{connection.name}</GenericFieldLabel>}
        <GenericFieldLabel label="Scope" className="capitalize">
          {config.scope}
        </GenericFieldLabel>
        <GenericFieldLabel label="Project">{projectName || projectId}</GenericFieldLabel>
      </SecretScanningDataSourceConfigReviewSection>
    );
  }

  // group-scope

  const { includeProjects, groupName, groupId } = config;
  const shouldScanAll = includeProjects.includes("*");

  return (
    <SecretScanningDataSourceConfigReviewSection>
      {connection && <GenericFieldLabel label="Connection">{connection.name}</GenericFieldLabel>}
      <GenericFieldLabel label="Scope" className="capitalize">
        {config.scope}
      </GenericFieldLabel>
      <GenericFieldLabel label="Group">{groupName || groupId}</GenericFieldLabel>
      <GenericFieldLabel label="Scan Projects">
        {shouldScanAll ? "All" : includeProjects.join(", ")}
      </GenericFieldLabel>
    </SecretScanningDataSourceConfigReviewSection>
  );
};
