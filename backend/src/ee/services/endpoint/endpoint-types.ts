import {
  EndpointDestinationKind,
  EndpointEventType,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType
} from "./endpoint-enums";

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
  kind: EndpointDestinationKind;
  destination: string;
  action?: EndpointNetworkRuleAction;
  thresholdBytes?: number;
  isEnabled?: boolean;
};

export type TUpdateEndpointNetworkRuleDTO = {
  ruleId: string;
  name?: string;
  kind?: EndpointDestinationKind;
  destination?: string;
  action?: EndpointNetworkRuleAction;
  thresholdBytes?: number;
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
