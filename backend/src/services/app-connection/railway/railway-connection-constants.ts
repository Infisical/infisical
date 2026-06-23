export enum RailwayConnectionMethod {
  AccountToken = "account-token",
  ProjectToken = "project-token",
  TeamToken = "team-token"
}

// Railway DeploymentStatus enum values (https://docs.railway.com/reference/public-api)
export enum RailwayDeploymentStatus {
  Building = "BUILDING",
  Crashed = "CRASHED",
  Deploying = "DEPLOYING",
  Failed = "FAILED",
  Initializing = "INITIALIZING",
  NeedsApproval = "NEEDS_APPROVAL",
  Queued = "QUEUED",
  Removed = "REMOVED",
  Removing = "REMOVING",
  Skipped = "SKIPPED",
  Sleeping = "SLEEPING",
  Success = "SUCCESS",
  Waiting = "WAITING"
}

// Deployments in these states have no build snapshot to replay, so Railway rejects
// `deploymentRedeploy` with "Cannot redeploy without a snapshot". Skip them when
// selecting a deployment to redeploy.
export const RAILWAY_NON_REDEPLOYABLE_STATUSES = new Set<string>([
  RailwayDeploymentStatus.Building,
  RailwayDeploymentStatus.Deploying,
  RailwayDeploymentStatus.Queued,
  RailwayDeploymentStatus.Initializing,
  RailwayDeploymentStatus.Waiting,
  RailwayDeploymentStatus.NeedsApproval,
  RailwayDeploymentStatus.Skipped,
  RailwayDeploymentStatus.Failed,
  RailwayDeploymentStatus.Removed,
  RailwayDeploymentStatus.Removing
]);
