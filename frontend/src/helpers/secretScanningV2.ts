import { AlertTriangleIcon, BanIcon, CheckIcon, LucideIcon, SearchSlashIcon } from "lucide-react";

import { TBadgeProps } from "@app/components/v3";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  TSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

export const SECRET_SCANNING_DATA_SOURCE_MAP: Record<
  SecretScanningDataSource,
  { name: string; image: string; size: number }
> = {
  [SecretScanningDataSource.GitHub]: {
    name: "GitHub",
    image: "GitHub.png",
    size: 45
  },
  [SecretScanningDataSource.Bitbucket]: {
    name: "Bitbucket",
    image: "Bitbucket.png",
    size: 45
  },
  [SecretScanningDataSource.GitLab]: {
    name: "GitLab",
    image: "GitLab.png",
    size: 45
  }
};

export const SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP: Record<
  SecretScanningDataSource,
  AppConnection
> = {
  [SecretScanningDataSource.GitHub]: AppConnection.GitHubRadar,
  [SecretScanningDataSource.Bitbucket]: AppConnection.Bitbucket,
  [SecretScanningDataSource.GitLab]: AppConnection.GitLab
};

// GitLab discovery relies on group-level webhooks, so a project-scoped data source cannot discover new projects.
export const doesDataSourceSupportDiscovery = ({
  type,
  config
}: {
  type: SecretScanningDataSource;
  config?: unknown;
}) =>
  !(
    type === SecretScanningDataSource.GitLab &&
    (config as { scope?: string } | undefined)?.scope !== GitLabDataSourceScope.Group
  );

// a project-scoped GitLab data source scans exactly one project, so it has no include list to add to
export const canAddSecretScanningResources = (dataSource: TSecretScanningDataSource) =>
  !(
    dataSource.type === SecretScanningDataSource.GitLab &&
    dataSource.config.scope === GitLabDataSourceScope.Project
  );

export const getConfigWithIncludedResource = (
  dataSource: TSecretScanningDataSource,
  resourceName: string
): TSecretScanningDataSource["config"] | null => {
  const append = (names: string[]) => [...names.filter((name) => name !== "*"), resourceName];

  switch (dataSource.type) {
    case SecretScanningDataSource.Bitbucket:
    case SecretScanningDataSource.GitHub:
      return { ...dataSource.config, includeRepos: append(dataSource.config.includeRepos) };
    case SecretScanningDataSource.GitLab:
      if (dataSource.config.scope === GitLabDataSourceScope.Project) return null;
      return {
        ...dataSource.config,
        includeProjects: append(dataSource.config.includeProjects)
      };
    default:
      return null;
  }
};

// mirrors what the backend does with resources added to the include list
export const getAddedResourceScanDescription = (
  dataSource: Pick<TSecretScanningDataSource, "isHistoricalScanEnabled" | "isScanNewCommitsEnabled">
) => {
  if (dataSource.isHistoricalScanEnabled) return "Their full history will be scanned for secrets.";
  if (dataSource.isScanNewCommitsEnabled) return "Only commits pushed from now on will be scanned.";
  return "Nothing will be scanned until Historical Scan or Scan New Commits is turned on in Settings.";
};

export const getConfigWithAllResourcesIncluded = (
  dataSource: TSecretScanningDataSource
): TSecretScanningDataSource["config"] | null => {
  switch (dataSource.type) {
    case SecretScanningDataSource.Bitbucket:
    case SecretScanningDataSource.GitHub:
      return { ...dataSource.config, includeRepos: ["*"] };
    case SecretScanningDataSource.GitLab:
      if (dataSource.config.scope === GitLabDataSourceScope.Project) return null;
      return { ...dataSource.config, includeProjects: ["*"] };
    default:
      return null;
  }
};

export const areAllSecretScanningResourcesIncluded = (dataSource: TSecretScanningDataSource) => {
  switch (dataSource.type) {
    case SecretScanningDataSource.Bitbucket:
    case SecretScanningDataSource.GitHub:
      return dataSource.config.includeRepos.includes("*");
    case SecretScanningDataSource.GitLab:
      return (
        dataSource.config.scope === GitLabDataSourceScope.Project ||
        dataSource.config.includeProjects.includes("*")
      );
    default:
      return false;
  }
};

export const isSecretScanningResourceIncluded = (
  dataSource: TSecretScanningDataSource,
  resourceName: string
) => {
  switch (dataSource.type) {
    case SecretScanningDataSource.Bitbucket:
    case SecretScanningDataSource.GitHub:
      return (
        dataSource.config.includeRepos.includes("*") ||
        dataSource.config.includeRepos.includes(resourceName)
      );
    case SecretScanningDataSource.GitLab:
      if (dataSource.config.scope === GitLabDataSourceScope.Project) return true;

      return (
        dataSource.config.includeProjects.includes("*") ||
        dataSource.config.includeProjects.includes(resourceName)
      );
    default:
      throw new Error(
        `Unhandled Data Source Type: ${(dataSource as TSecretScanningDataSource).type}`
      );
  }
};

export const RESOURCE_DESCRIPTION_HELPER: Record<
  SecretScanningDataSource,
  {
    verb: string;
    pluralNoun: string;
    singularNoun: string;
    singularTitle: string;
    pluralTitle: string;
  }
> = {
  [SecretScanningDataSource.GitHub]: {
    verb: "push",
    pluralNoun: "repositories",
    singularNoun: "repository",
    pluralTitle: "Repositories",
    singularTitle: "Repository"
  },
  [SecretScanningDataSource.Bitbucket]: {
    verb: "push",
    pluralNoun: "repositories",
    singularNoun: "repository",
    pluralTitle: "Repositories",
    singularTitle: "Repository"
  },
  [SecretScanningDataSource.GitLab]: {
    verb: "push",
    pluralNoun: "projects",
    singularNoun: "project",
    pluralTitle: "Projects",
    singularTitle: "Project"
  }
};

export const SECRET_SCANNING_FINDING_STATUS_MAP: Record<
  SecretScanningFindingStatus,
  {
    Icon: LucideIcon;
    variant: TBadgeProps["variant"];
    className: string;
    name: string;
    description: string;
  }
> = {
  [SecretScanningFindingStatus.Resolved]: {
    Icon: CheckIcon,
    variant: "success",
    className: "text-success",
    name: "Resolved",
    description: "The credential was rotated or revoked."
  },
  [SecretScanningFindingStatus.Unresolved]: {
    Icon: AlertTriangleIcon,
    variant: "warning",
    className: "text-warning",
    name: "Unresolved",
    description: "Needs review. New findings start here."
  },
  [SecretScanningFindingStatus.Ignore]: {
    Icon: BanIcon,
    variant: "neutral",
    className: "text-neutral",
    name: "Ignored",
    description: "The risk is accepted. Ignored findings don't count as unresolved."
  },
  [SecretScanningFindingStatus.FalsePositive]: {
    Icon: SearchSlashIcon,
    variant: "neutral",
    className: "text-neutral",
    name: "False Positive",
    description: "Not a secret. The rule matched something harmless."
  }
};

export const SECRET_SCANNING_FINDING_STATUS_ORDER = [
  SecretScanningFindingStatus.Unresolved,
  SecretScanningFindingStatus.Resolved,
  SecretScanningFindingStatus.FalsePositive,
  SecretScanningFindingStatus.Ignore
] as const;
