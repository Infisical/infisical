export enum PamResourceType {
  Postgres = "postgres",
  MySQL = "mysql",
  RDP = "rdp",
  SSH = "ssh",
  Kubernetes = "kubernetes"
}

export enum PamSessionStatus {
  Starting = "starting",
  Active = "active",
  Ended = "ended",
  Terminated = "terminated"
}
