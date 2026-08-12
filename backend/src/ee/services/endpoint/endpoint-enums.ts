export enum EndpointDeviceStatus {
  Active = "active",
  Inactive = "inactive"
}

export enum EndpointNetworkRuleType {
  Destination = "destination",
  Volume = "volume"
}

export enum EndpointNetworkRuleAction {
  Deny = "deny",
  Allow = "allow"
}

export enum EndpointDestinationKind {
  Ip = "ip",
  Cidr = "cidr",
  Domain = "domain"
}

export enum EndpointEventType {
  AgentStarted = "agent.started",
  AgentStopped = "agent.stopped",
  NetworkPolicyApplied = "network.policy_applied",
  NetworkDestinationBlocked = "network.destination_blocked",
  NetworkTransferThresholdTripped = "network.transfer_threshold_tripped",
  PrivateAccessTunnelUp = "private_access.tunnel_up",
  PrivateAccessTunnelDown = "private_access.tunnel_down"
}
