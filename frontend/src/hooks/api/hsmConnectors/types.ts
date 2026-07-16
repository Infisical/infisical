import { CertStatus } from "@app/hooks/api/certificates/enums";

export type THsmConnector = {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  gatewayId: string | null;
  gatewayPoolId: string | null;
  slotLabel: string;
  keyNamePrefix: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TCreateHsmConnectorPayload = {
  name: string;
  description?: string;
  gatewayId?: string;
  gatewayPoolId?: string;
  credentials: {
    slotLabel: string;
    pin: string;
    keyNamePrefix?: string;
  };
};

export type TUpdateHsmConnectorPayload = {
  connectorId: string;
  name?: string;
  description?: string;
  gatewayId?: string;
  gatewayPoolId?: string;
  credentials?: {
    slotLabel?: string;
    pin?: string;
    keyNamePrefix?: string;
  };
};

export type THsmConnectorTestMemberResult =
  | {
      gatewayId: string;
      ok: true;
      slotInfo: { manufacturer: string; model: string; firmware: string };
    }
  | {
      gatewayId: string;
      ok: false;
      errorCode: string;
      errorMessage: string;
    };

export type THsmConnectorTestResult = {
  ok: boolean;
  members: THsmConnectorTestMemberResult[];
};

export type THsmConnectorLinkedCertificate = {
  id: string;
  commonName: string;
  status: CertStatus;
  notAfter: string;
  hsmKeyLabel: string | null;
  createdAt: string;
};

export type THsmConnectorLinkedCertificateAuthority = {
  id: string;
  name: string;
  commonName: string | null;
  status: string;
  type: string;
  hsmKeyLabel: string | null;
  createdAt: string;
};
