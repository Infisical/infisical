import {
  faBan,
  faCheck,
  faMagnifyingGlassMinus,
  faWarning
} from "@fortawesome/free-solid-svg-icons";

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
  }
};

export const SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP: Record<
  SecretScanningDataSource,
  AppConnection
> = {
  [SecretScanningDataSource.GitHub]: AppConnection.GitHubRadar
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
  }
};

export const SECRET_SCANNING_FINDING_STATUS_ICON_MAP = {
  [SecretScanningFindingStatus.Resolved]: { icon: faCheck, className: "text-green" },
  [SecretScanningFindingStatus.Unresolved]: { icon: faWarning, className: "text-yellow" },
  [SecretScanningFindingStatus.Ignore]: { icon: faBan, className: "text-mineshaft-400" },
  [SecretScanningFindingStatus.FalsePositive]: {
    icon: faMagnifyingGlassMinus,
    className: "text-mineshaft-400"
  }
};
