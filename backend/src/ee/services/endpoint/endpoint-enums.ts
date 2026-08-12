export enum EndpointDeviceStatus {
  Active = "active",
  Inactive = "inactive"
}

export enum EndpointEgressRuleType {
  Destination = "destination",
  Volume = "volume"
}

export enum EndpointEgressRuleAction {
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
  EgressPolicyApplied = "egress.policy_applied",
  EgressDestinationBlocked = "egress.destination_blocked",
  EgressVolumeThresholdTripped = "egress.volume_threshold_tripped",
  PrivateAccessTunnelUp = "private_access.tunnel_up",
  PrivateAccessTunnelDown = "private_access.tunnel_down"
}
