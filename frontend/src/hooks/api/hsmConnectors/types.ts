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

export type THsmConnectorKey = {
  keyId: string;
  keyAlgorithm: string;
};

export enum HsmKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_3072 = "RSA_3072",
  RSA_4096 = "RSA_4096",
  ECC_P256 = "ECC_P256",
  ECC_P384 = "ECC_P384",
  ML_DSA_44 = "ML_DSA_44",
  ML_DSA_65 = "ML_DSA_65",
  ML_DSA_87 = "ML_DSA_87"
}

export const hsmKeyAlgorithmLabels: Record<HsmKeyAlgorithm, string> = {
  [HsmKeyAlgorithm.RSA_2048]: "RSA-2048",
  [HsmKeyAlgorithm.RSA_3072]: "RSA-3072",
  [HsmKeyAlgorithm.RSA_4096]: "RSA-4096",
  [HsmKeyAlgorithm.ECC_P256]: "ECDSA P-256",
  [HsmKeyAlgorithm.ECC_P384]: "ECDSA P-384",
  [HsmKeyAlgorithm.ML_DSA_44]: "ML-DSA-44",
  [HsmKeyAlgorithm.ML_DSA_65]: "ML-DSA-65",
  [HsmKeyAlgorithm.ML_DSA_87]: "ML-DSA-87"
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
