// Discovery Sources
export enum PamDiscoveryType {
  ActiveDirectory = "active-directory"
}

export const PAM_DISCOVERY_TYPE_PASCAL_MAP: Record<PamDiscoveryType, string> = {
  [PamDiscoveryType.ActiveDirectory]: "ActiveDirectory"
};

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

// Discovery Run Step Status (sub-step progress within a run)
export enum PamDiscoveryStepStatus {
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Skipped = "skipped"
}

// Discovery Runs
export enum PamDiscoverySourceRunStatus {
  Running = "running",
  Completed = "completed",
  Failed = "failed"
}

export enum PamDiscoverySourceRunTrigger {
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

export enum PamDependencySyncStatus {
  Pending = "pending",
  Success = "success",
  Failed = "failed"
}
