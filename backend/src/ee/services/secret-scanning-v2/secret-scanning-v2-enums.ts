export enum SecretScanningDataSource {
  GitHub = "github",
  GitLab = "gitlab"
}

export enum SecretScanningScanStatus {
  Completed = "completed",
  Failed = "failed",
  Queued = "queued"
}

export enum SecretScanningFindingStatus {
  Resolved = "resolved",
  Unresolved = "unresolved"
}

// TODO: should this be source type specific?
export enum SecretScanningResource {
  Repository = "repository"
}
