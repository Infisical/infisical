// Discovery Sources
export enum PamDiscoveryType {
  ActiveDirectory = "active-directory"
}

export enum PamDiscoverySourceStatus {
  Active = "active",
  Paused = "paused",
  Error = "error"
}

export enum PamDiscoverySchedule {
  Manual = "manual",
  Daily = "daily",
  Weekly = "weekly"
}

export enum PamDiscoveryOrderBy {
  Name = "name"
}

// Discovery Runs
export enum PamDiscoveryRunStatus {
  Running = "running",
  Completed = "completed",
  Failed = "failed"
}

export enum PamDiscoveryRunTrigger {
  Manual = "manual",
  Schedule = "schedule"
}

// Dependencies
export enum PamAccountDependencyType {
  WindowsService = "windows-service",
  ScheduledTask = "scheduled-task",
  IisAppPool = "iis-app-pool"
}

export enum PamAccountDependencySource {
  Discovery = "discovery",
  Manual = "manual"
}
