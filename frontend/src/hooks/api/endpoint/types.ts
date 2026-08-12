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

// kind and destination are null on a volume rule. A volume rule applies to every destination, and
// the ones it is actually measuring are discovered on the device and arrive as counters.
export type TEndpointNetworkRule = {
  id: string;
  projectId: string;
  ruleType: EndpointNetworkRuleType;
  action?: EndpointNetworkRuleAction | null;
  kind?: EndpointDestinationKind | null;
  destination?: string | null;
  // thresholdBytes is a rate, not a lifetime total: that many bytes within windowSeconds.
  thresholdBytes?: number | null;
  windowSeconds?: number | null;
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
  networkRuleId?: string | null;
  detail?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type TEndpointCounter = {
  id: string;
  deviceId: string;
  deviceName: string;
  networkRuleId: string;
  ruleName: string;
  ruleWindowSeconds?: number | null;
  destination: string;
  bytesOut: number;
  thresholdBytes?: number | null;
  tripped: boolean;
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TListEndpointEventsDTO = {
  limit?: number;
  cursor?: string;
  deviceId?: string;
};

export type TListEndpointCountersDTO = {
  deviceId?: string;
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

export type TCreateEndpointNetworkRuleDTO = {
  ruleType: EndpointNetworkRuleType;
  name: string;
  kind?: EndpointDestinationKind;
  destination?: string;
  action?: EndpointNetworkRuleAction;
  thresholdBytes?: number;
  windowSeconds?: number;
  isEnabled?: boolean;
};

export type TUpdateEndpointNetworkRuleDTO = {
  ruleId: string;
  name?: string;
  kind?: EndpointDestinationKind;
  destination?: string;
  action?: EndpointNetworkRuleAction;
  thresholdBytes?: number;
  windowSeconds?: number;
  isEnabled?: boolean;
};

export type TDeleteEndpointNetworkRuleDTO = {
  ruleId: string;
};
