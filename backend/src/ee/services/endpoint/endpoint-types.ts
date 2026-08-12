import {
  EndpointDestinationKind,
  EndpointEgressRuleAction,
  EndpointEgressRuleType,
  EndpointEventType
} from "./endpoint-enums";

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

export type TListEndpointEventsDTO = {
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
