import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import type {
  THsmConnectorLinkedCertificate,
  THsmConnectorLinkedCertificateAuthority
} from "@app/hooks/api/hsmConnectors/types";

import { hsmDemo } from "../cert-manager-settings/demo-hsm";
import type { HsmConnectorsAdapter, THsmConnectorLinkedResources } from "./contract";

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString();

const authority = (
  id: string,
  name: string,
  hsmKeyLabel: string,
  createdAt: string
): THsmConnectorLinkedCertificateAuthority => ({
  id,
  name,
  commonName: name,
  status: CaStatus.ACTIVE,
  type: CaType.INTERNAL,
  hsmKeyLabel,
  createdAt
});

const certificate = (
  id: string,
  commonName: string,
  expiresInDays: number,
  hsmKeyLabel: string | null,
  status = CertStatus.ACTIVE
): THsmConnectorLinkedCertificate => ({
  id,
  commonName,
  status,
  notAfter: day(expiresInDays),
  hsmKeyLabel,
  createdAt: day(expiresInDays - 365)
});

const linked: Record<string, THsmConnectorLinkedResources> = {
  "7c1e4a2b-9d3f-4e6a-8b5c-2f7d9e1a3c45": {
    certificateAuthorities: [
      authority(
        "1b7e9a30-5c4d-4f82-a6e3-0d9f2c8b5e71",
        "Acme Internal Root CA",
        "infisical-ca-root-2026",
        "2026-07-09T17:12:00Z"
      ),
      authority(
        "8d2f4c61-3a7e-4b19-9f05-c6e1a2b7d438",
        "Acme Issuing CA G2",
        "infisical-ca-issuing-g2",
        "2026-07-10T09:45:00Z"
      )
    ],
    certificates: [
      certificate("0f6b2d84-1e9a-4c37-b5d2-8a3e7c1f9d06", "api.acme.dev", 84, "infisical-api-acme"),
      certificate(
        "6c1e8a3f-4b2d-4f90-8e75-d03a9b6c2e41",
        "payments.acme.dev",
        13,
        "infisical-payments-acme"
      ),
      certificate(
        "d84c1b6e-2f73-4a95-b0e8-7c5a3d9f1e26",
        "dashboard.acme.dev",
        201,
        "infisical-dashboard-acme"
      ),
      certificate(
        "5d8b4f20-3c6a-4e17-9b52-0f7e1a8d3c64",
        "legacy-billing.acme.dev",
        -6,
        "infisical-legacy-billing",
        CertStatus.EXPIRED
      )
    ],
    totalCount: 4
  },
  "e4b8d2f6-1a3c-4b5d-8e7f-9a0b1c2d3e84": {
    certificateAuthorities: [],
    certificates: [
      certificate(
        "c56e2a18-7d9f-4b03-8e61-4a0b5c3d9f72",
        "release-signer",
        322,
        "infisical-release-signer"
      )
    ],
    totalCount: 1
  }
};

const none: THsmConnectorLinkedResources = {
  certificateAuthorities: [],
  certificates: [],
  totalCount: 0
};

export const hsmConnectorsDemo: HsmConnectorsAdapter = {
  useHsmConnector: (connectorId) => {
    const { data } = hsmDemo.useHsmConnectors();
    return {
      data: data?.find((entry) => entry.id === connectorId),
      isPending: false,
      error: null
    };
  },
  useLinkedResources: (connectorId, { offset, limit }) => {
    const resources = linked[connectorId] ?? none;
    return {
      data: {
        ...resources,
        certificates: resources.certificates.slice(offset, offset + limit)
      },
      isPending: false,
      error: null
    };
  }
};
