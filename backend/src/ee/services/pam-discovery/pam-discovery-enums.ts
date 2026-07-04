export enum PamDiscoveryType {
  ActiveDirectory = "active-directory"
}

export enum PamDiscoverySchedule {
  Manual = "manual",
  Daily = "daily",
  Weekly = "weekly"
}

export enum PamDiscoveryRunStatus {
  Running = "running",
  Completed = "completed",
  Failed = "failed"
}

export enum PamDiscoveryRunTrigger {
  Manual = "manual",
  Schedule = "schedule"
}
