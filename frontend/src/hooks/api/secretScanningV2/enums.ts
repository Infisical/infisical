export enum SecretScanningDataSource {
  GitHub = "github",
  Bitbucket = "bitbucket",
  GitLab = "gitlab"
}

export enum SecretScanningScanStatus {
  Completed = "completed",
  Failed = "failed",
  Queued = "queued",
  Scanning = "scanning"
}

export enum SecretScanningScanType {
  Historical = "historical",
  Realtime = "realtime"
}

export enum SecretScanningFindingStatus {
  Resolved = "resolved",
  Unresolved = "unresolved",
  FalsePositive = "false-positive",
  Ignore = "ignore"
}

export enum SecretScanningFindingSeverity {
  High = "high",
  Medium = "medium",
  Low = "low"
}

export enum SecretScanningFindingConfidence {
  High = "high",
  Medium = "medium",
  Low = "low"
}
