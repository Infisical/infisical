import type { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import type {
  TCreateHsmConnectorPayload,
  THsmConnector,
  THsmConnectorTestResult,
  TUpdateHsmConnectorPayload
} from "@app/hooks/api/hsmConnectors/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type HsmPlan = { hsm: boolean; gatewayPool: boolean; requireGatewayPools: boolean };

type QueryOptions = { enabled?: boolean };

export type CertManagerHsmAdapter = {
  useHsmPlan: (orgId: string) => V4QueryResult<HsmPlan>;
  useHsmConnectors: (options?: QueryOptions) => V4QueryResult<THsmConnector[]>;
  useHsmGateways: (options?: QueryOptions) => V4QueryResult<TGatewayV2[]>;
  useHsmAllGateways: (options?: QueryOptions) => V4QueryResult<TGatewayV2[]>;
  useHsmGatewayPools: (options?: QueryOptions) => V4QueryResult<TGatewayPool[]>;
  useCreateHsmConnector: V4Mutation<TCreateHsmConnectorPayload, THsmConnector>;
  useUpdateHsmConnector: V4Mutation<TUpdateHsmConnectorPayload, THsmConnector>;
  useDeleteHsmConnector: V4Mutation<{ connectorId: string }, { id: string }>;
  useTestHsmConnector: V4Mutation<{ connectorId: string }, THsmConnectorTestResult>;
};
