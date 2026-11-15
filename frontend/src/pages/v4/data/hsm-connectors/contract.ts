import type {
  THsmConnector,
  THsmConnectorLinkedCertificate,
  THsmConnectorLinkedCertificateAuthority
} from "@app/hooks/api/hsmConnectors/types";

import type { V4QueryResult } from "../contract";

export type THsmConnectorLinkedResources = {
  certificates: THsmConnectorLinkedCertificate[];
  certificateAuthorities: THsmConnectorLinkedCertificateAuthority[];
  totalCount: number;
};

export type HsmConnectorsAdapter = {
  useHsmConnector: (connectorId: string) => V4QueryResult<THsmConnector>;
  useLinkedResources: (
    connectorId: string,
    pagination: { offset: number; limit: number }
  ) => V4QueryResult<THsmConnectorLinkedResources>;
};
