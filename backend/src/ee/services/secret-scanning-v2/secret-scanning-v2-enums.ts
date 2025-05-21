export enum SecretScanningDataSource {
  GitHub = "github",
  GitLab = "gitlab"
}

export enum SecretScanningScanStatus {
  Completed = "completed",
  Failed = "failed",
  Queued = "queued",
  Scanning = "scanning"
}

export enum SecretScanningScanType {
  FullScan = "full-scan",
  DiffScan = "diff-scan"
}

export enum SecretScanningFindingStatus {
  Resolved = "resolved",
  Unresolved = "unresolved"
}

// TODO: should this be source type specific?
export enum SecretScanningResource {
  Repository = "repository",
  Project = "project"
}
