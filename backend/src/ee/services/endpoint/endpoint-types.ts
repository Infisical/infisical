import {
  EndpointDestinationKind,
  EndpointDeviceAppSource,
  EndpointEventType,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType,
  EndpointTargetKind
} from "./endpoint-enums";

export type TRegisterEndpointDeviceDTO = {
  userId: string;
  name: string;
};

export type TDeleteEndpointDeviceDTO = {
  deviceId: string;
};

// kind and destination belong to a destination rule only. A volume rule has no destination: it
// applies to whichever destination a device sends too much to.
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

export type TListEndpointEventsDTO = {
  deviceId?: string;
  limit: number;
  cursor?: string;
};

export type TEndpointHeartbeatDTO = {
  agentVersion: string;
  configVersion: number;
  counters: {
    volumeRuleId: string;
    destination: string;
    bytesOut: number;
    thresholdBytes: number;
    tripped: boolean;
  }[];
  // How much went to each destination since the last heartbeat, whether or not a rule watches it.
  // A counter is a level, this is a delta, so the two cannot be derived from one another.
  transfers?:
    | {
        destination: string;
        bytesOut: number;
      }[]
    | null;
  // What the machine is. Sent on the agent's first heartbeat and rarely after, so every field is
  // optional and an absent object means "nothing new", not "nothing known".
  device?: {
    hostname?: string;
    platform?: string;
    arch?: string;
    osName?: string;
    osVersion?: string;
    osBuild?: string;
    modelIdentifier?: string;
    cpuModel?: string;
    cpuCores?: number;
    memoryBytes?: number;
    serialNumber?: string;
    ipAddress?: string;
    bootedAt?: string;
  };
  enforcement: {
    pfEnabled: boolean;
    blockedAddresses: string[];
  };
};

export type TReportEndpointEventsDTO = {
  events: {
    idempotencyKey: string;
    type: EndpointEventType;
    occurredAt: string;
    destination?: string | null;
    ruleId?: string | null;
    detail?: Record<string, unknown> | null;
  }[];
};

export type TListEndpointCountersDTO = {
  deviceId?: string;
};

export type TListEndpointTransferHistoryDTO = {
  deviceId?: string;
  lookbackHours: number;
  limit: number;
};

// Always one device: an app inventory is a property of a machine, and a fleet-wide list of every
// binary on every laptop answers no question anyone asks.
export type TListEndpointDeviceAppsDTO = {
  deviceId: string;
};

// The whole inventory, every time. An agent that reports a shorter list has had apps uninstalled,
// which is exactly what the replace is for.
export type TReportEndpointDeviceAppsDTO = {
  apps: {
    name: string;
    bundleId?: string | null;
    version?: string | null;
    path: string;
    source: EndpointDeviceAppSource;
    isRunning: boolean;
  }[];
};

// 'ip' targets carry their address in destination; 'domain' targets may carry one in ip, for the
// case where the gateway's own DNS cannot resolve the name the device uses.
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

export type TConnectEndpointTargetDTO = {
  targetId: string;
};
