export enum AgentGatewayPrincipalKind {
  User = "user",
  Identity = "identity",
  Group = "group"
}

export enum AgentGatewaySessionMode {
  // The broker runs inside the Infisical Gateway on another host, so credentials are resolved under the
  // authority of whoever configured each proxied service.
  Remote = "remote",
  // The broker runs in the caller's own CLI process, so there is no boundary between the caller and the
  // plaintext. Credentials are resolved under the caller's own permissions instead.
  Local = "local"
}

export enum AgentGatewaySessionStatus {
  Active = "active",
  Ended = "ended",
  Expired = "expired"
}

// Where a request goes when no connected proxied service matches its host. Set on the agent gateway, because
// an agent choosing its own passthrough behaviour would defeat the point of an allow list.
export enum AgentGatewayUnmatchedHostPolicy {
  Allow = "allow",
  Block = "block"
}
