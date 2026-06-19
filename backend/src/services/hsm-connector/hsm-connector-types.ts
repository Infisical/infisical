import { OrgServiceActor } from "@app/lib/types";

export type THsmConnectorCredentials = {
  slotLabel: string;
  pin: string;
  keyNamePrefix?: string;
};

export type TCreateHsmConnectorDTO = {
  name: string;
  description?: string;
  projectId: string;
  gatewayId?: string;
  gatewayPoolId?: string;
  credentials: THsmConnectorCredentials;
};

export type TUpdateHsmConnectorDTO = {
  connectorId: string;
  name?: string;
  description?: string;
  gatewayId?: string;
  gatewayPoolId?: string;
  credentials?: Partial<THsmConnectorCredentials>;
};

export type TGetHsmConnectorByIdDTO = {
  connectorId: string;
};

export type TListHsmConnectorsDTO = {
  projectId: string;
};

export type TDeleteHsmConnectorDTO = {
  connectorId: string;
};

export type TTestHsmConnectorDTO = {
  connectorId: string;
};

export type TPkcs11SlotInfo = {
  manufacturer: string;
  model: string;
  firmware: string;
};

export type THsmConnectorTestMemberResult =
  | { gatewayId: string; ok: true; slotInfo: TPkcs11SlotInfo }
  | { gatewayId: string; ok: false; errorCode: string; errorMessage: string };

export type THsmConnectorTestResult = {
  ok: boolean;
  members: THsmConnectorTestMemberResult[];
};

export type THsmConnectorSanitized = {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  gatewayId: string | null;
  gatewayPoolId: string | null;
  slotLabel: string;
  keyNamePrefix: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type THsmConnectorServiceActor = OrgServiceActor;
