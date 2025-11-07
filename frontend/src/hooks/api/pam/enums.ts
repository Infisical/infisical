// Resources
export enum PamResourceType {
  Postgres = "postgres",
  MySQL = "mysql",
  RDP = "rdp",
  SSH = "ssh",
  Kubernetes = "kubernetes"
}

export enum PamResourceOrderBy {
  Name = "name"
}

// Sessions
export enum PamSessionStatus {
  Starting = "starting",
  Active = "active",
  Ended = "ended",
  Terminated = "terminated"
}

// Accounts
export enum PamAccountOrderBy {
  Name = "name"
}

export enum PamAccountView {
  Flat = "flat",
  Nested = "nested"
}
