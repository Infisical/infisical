export enum SecretScanningDataSource {
  GitHub = "github",
  Bitbucket = "bitbucket"
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
  Unresolved = "unresolved",
  FalsePositive = "false-positive",
  Ignore = "ignore"
}

export enum SecretScanningResource {
  Repository = "repository",
  Project = "project"
}

export enum SecretScanningFindingSeverity {
  High = "high",
  Medium = "medium",
  Low = "low"
}
