export enum PortainerConnectionMethod {
  ApiToken = "api-token"
}

export enum PortainerStackType {
  Swarm = 1,
  Compose = 2,
  Kubernetes = 3
}

export enum PortainerStackStatus {
  Active = 1,
  Inactive = 2,
  Deploying = 3,
  Error = 4
}
