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

// No 'cidr' member on purpose: routing a whole range needs a TUN device on the agent, so offering
// it in the console would be a control that silently does nothing.
export enum EndpointTargetKind {
  Domain = "domain",
  Ip = "ip"
}

export enum EndpointEventType {
  AgentStarted = "agent.started",
  AgentStopped = "agent.stopped",
  NetworkPolicyApplied = "network.policy_applied",
  NetworkDestinationBlocked = "network.destination_blocked",
  NetworkTransferThresholdTripped = "network.transfer_threshold_tripped",
  PrivateAccessTunnelUp = "private_access.tunnel_up",
  PrivateAccessTunnelDown = "private_access.tunnel_down",
  ScanStarted = "scan.started",
  ScanCompleted = "scan.completed"
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
  // What the machine reported about itself. All nullable: a device that has never run the agent has
  // none of it, and a field its platform could not answer stays empty.
  hostname?: string | null;
  platform?: string | null;
  arch?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  osBuild?: string | null;
  modelIdentifier?: string | null;
  cpuModel?: string | null;
  cpuCores?: number | null;
  memoryBytes?: number | null;
  serialNumber?: string | null;
  ipAddress?: string | null;
  bootedAt?: string | null;
  systemInfoReportedAt?: string | null;
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

// One destination, rolled up over the range asked for. A counter is what a destination is doing now;
// this is what it did, and it outlives the transfer that produced it.
export type TEndpointTransfer = {
  destination: string;
  totalBytesOut: number;
  // The most sent in any single bucket. bucketSeconds is the span that makes it a rate.
  peakBytesOut: number;
  bucketSeconds: number;
  // Time the device spent actually sending, which is not lastSeenAt minus firstSeenAt: a device that
  // sent for a minute this morning and a minute now transferred for two minutes, not for six hours.
  activeSeconds: number;
  firstSeenAt: string;
  lastSeenAt: string;
  blocked: boolean;
};

export type TListEndpointEventsDTO = {
  limit?: number;
  cursor?: string;
  deviceId?: string;
};

export type TListEndpointCountersDTO = {
  deviceId?: string;
};

export type TListEndpointTransfersDTO = {
  deviceId?: string;
  lookbackHours?: number;
  limit?: number;
};

export type TListEndpointTransfersResponse = {
  transfers: TEndpointTransfer[];
  lookbackHours: number;
};

export enum EndpointDeviceAppSource {
  System = "system",
  User = "user"
}

export type TEndpointDeviceApp = {
  id: string;
  name: string;
  bundleId: string | null;
  version: string | null;
  path: string;
  source: EndpointDeviceAppSource;
  // True as of lastSeenAt, which is when the inventory ran — not a live signal.
  isRunning: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type TListEndpointDeviceAppsDTO = {
  deviceId: string;
};

export type TListEndpointDeviceAppsResponse = {
  apps: TEndpointDeviceApp[];
  // Null until the agent has sent an inventory. An empty list with no reportedAt means the device
  // has never been asked, not that it has nothing installed.
  reportedAt: string | null;
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

export type TEndpointTargetAssignment = {
  deviceId: string;
  deviceName: string;
};

// loopbackIp is the address the device listens on for a domain target, allocated by the backend and
// shown so an admin can see what the device will resolve the domain to. Null for an IP target, which
// claims its own destination address.
export type TEndpointTarget = {
  id: string;
  projectId: string;
  name: string;
  kind: EndpointTargetKind;
  destination: string;
  ip?: string | null;
  port: number;
  loopbackIp?: string | null;
  gatewayId?: string | null;
  gatewayName?: string | null;
  isEnabled: boolean;
  assignments: TEndpointTargetAssignment[];
  createdAt: string;
  updatedAt: string;
};

export type TCreateEndpointTargetDTO = {
  name: string;
  kind: EndpointTargetKind;
  destination: string;
  ip?: string;
  port: number;
  gatewayId: string;
  isEnabled?: boolean;
  deviceIds?: string[];
};

export type TUpdateEndpointTargetDTO = {
  targetId: string;
  name?: string;
  kind?: EndpointTargetKind;
  destination?: string;
  ip?: string | null;
  port?: number;
  gatewayId?: string;
  isEnabled?: boolean;
  deviceIds?: string[];
};

export type TDeleteEndpointTargetDTO = {
  targetId: string;
};

export enum EndpointCommandStatus {
  Pending = "pending",
  Dispatched = "dispatched",
  Succeeded = "succeeded",
  Failed = "failed",
  Errored = "errored",
  TimedOut = "timed_out",
  Canceled = "canceled",
  Expired = "expired"
}

export type TEndpointCommand = {
  id: string;
  deviceId: string;
  deviceName?: string;
  status: EndpointCommandStatus;
  shell: boolean;
  command: string;
  args: string[];
  timeoutSeconds: number;
  expiresAt: string;
  requestedByEmail: string | null;
  reason: string | null;
  dispatchedAt: string | null;
  completedAt: string | null;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  outputTruncated: boolean;
  error: string | null;
  createdAt: string;
};

export type TListEndpointCommandsDTO = {
  deviceId?: string;
  limit?: number;
  cursor?: string;
};

export type TListEndpointCommandsResponse = {
  commands: TEndpointCommand[];
  nextCursor: string | null;
};

export type TExecuteEndpointCommandDTO = {
  deviceId: string;
  command: string;
  args?: string[];
  shell?: boolean;
  timeoutSeconds?: number;
  reason?: string;
};

export type TCancelEndpointCommandDTO = {
  commandId: string;
};

export type TDeviceTargetAccessDTO = {
  deviceId: string;
  targetId: string;
};
