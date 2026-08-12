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

export type TEndpointDeviceOwner = {
  userId: string;
  email: string;
  name: string;
};

export type TEndpointDevice = {
  id: string;
  projectId: string;
  userId: string;
  owner: TEndpointDeviceOwner;
  name: string;
  status: EndpointDeviceStatus;
  lastSeenAt?: string | null;
  agentVersion?: string | null;
  configVersion: number;
  pfEnabled?: boolean | null;
  blockedAddresses: string[];
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TEndpointEgressRule = {
  id: string;
  projectId: string;
  ruleType: EndpointEgressRuleType;
  action?: EndpointEgressRuleAction | null;
  kind: EndpointDestinationKind;
  destination: string;
  thresholdBytes?: number | null;
  name: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TEndpointEvent = {
  id: string;
  projectId: string;
  deviceId: string;
  deviceName: string;
  eventType: EndpointEventType;
  occurredAt: string;
  destination?: string | null;
  egressRuleId?: string | null;
  detail?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type TListEndpointEventsDTO = {
  limit?: number;
  cursor?: string;
};

export type TListEndpointEventsResponse = {
  events: TEndpointEvent[];
  nextCursor: string | null;
};

export type TRegisterEndpointDeviceDTO = {
  userId: string;
  name: string;
};

export type TDeleteEndpointDeviceDTO = {
  deviceId: string;
};

export type TCreateEndpointEgressRuleDTO = {
  ruleType: EndpointEgressRuleType;
  name: string;
  kind: EndpointDestinationKind;
  destination: string;
  action?: EndpointEgressRuleAction;
  thresholdBytes?: number;
  isEnabled?: boolean;
};

export type TUpdateEndpointEgressRuleDTO = {
  ruleId: string;
  name?: string;
  kind?: EndpointDestinationKind;
  destination?: string;
  action?: EndpointEgressRuleAction;
  thresholdBytes?: number;
  isEnabled?: boolean;
};

export type TDeleteEndpointEgressRuleDTO = {
  ruleId: string;
};
