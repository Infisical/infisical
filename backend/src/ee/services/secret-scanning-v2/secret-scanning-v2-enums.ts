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

export enum SecretScanningScanTrigger {
  Manual = "manual",
  ResourcesAdded = "resources-added",
  Push = "push",
  PullRequest = "pull-request"
}

export enum SecretScanningFindingStatus {
  Resolved = "resolved",
  Unresolved = "unresolved",
  FalsePositive = "false-positive",
  Ignore = "ignore"
}

export enum SecretScanningFindingOrderBy {
  LastDetectedAt = "lastDetectedAt",
  CreatedAt = "createdAt",
  Rule = "rule",
  ResourceName = "resourceName",
  // deprecated: a finding can have several authors, so this sorts by its first location's author
  Author = "author",
  Status = "status"
}

export enum SecretScanningResourceOrderBy {
  Name = "name",
  Status = "status",
  LastScanned = "lastScanned"
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
