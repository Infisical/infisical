import { AlertTriangleIcon, BanIcon, CheckIcon, LucideIcon, SearchSlashIcon } from "lucide-react";

import { TBadgeProps } from "@app/components/v3";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus
} from "@app/hooks/api/secretScanningV2";

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
  { Icon: LucideIcon; variant: TBadgeProps["variant"]; className: string }
> = {
  [SecretScanningFindingStatus.Resolved]: {
    Icon: CheckIcon,
    variant: "success",
    className: "text-success"
  },
  [SecretScanningFindingStatus.Unresolved]: {
    Icon: AlertTriangleIcon,
    variant: "warning",
    className: "text-warning"
  },
  [SecretScanningFindingStatus.Ignore]: {
    Icon: BanIcon,
    variant: "neutral",
    className: "text-neutral"
  },
  [SecretScanningFindingStatus.FalsePositive]: {
    Icon: SearchSlashIcon,
    variant: "neutral",
    className: "text-neutral"
  }
};
