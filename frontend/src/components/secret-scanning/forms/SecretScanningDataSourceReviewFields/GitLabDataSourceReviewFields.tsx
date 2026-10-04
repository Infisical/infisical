import { useFormContext } from "react-hook-form";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
        {connection && (
          <Detail>
            <DetailLabel>Connection</DetailLabel>
            <DetailValue>{connection.name || "None"}</DetailValue>
          </Detail>
        )}
        <Detail>
          <DetailLabel>Scope</DetailLabel>
          <DetailValue className="capitalize">{config.scope}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Project</DetailLabel>
          <DetailValue>{projectName || projectId || "None"}</DetailValue>
        </Detail>
      </SecretScanningDataSourceConfigReviewSection>
    );
  }

  // group-scope

  const { includeProjects, groupName, groupId } = config;
  const shouldScanAll = includeProjects.includes("*");

  return (
    <SecretScanningDataSourceConfigReviewSection>
      {connection && (
        <Detail>
          <DetailLabel>Connection</DetailLabel>
          <DetailValue>{connection.name || "None"}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue className="capitalize">{config.scope}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Group</DetailLabel>
        <DetailValue>{groupName || groupId || "None"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scan Projects</DetailLabel>
        <DetailValue>{shouldScanAll ? "All" : includeProjects.join(", ") || "None"}</DetailValue>
      </Detail>
    </SecretScanningDataSourceConfigReviewSection>
  );
};
