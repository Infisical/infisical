import { OrderByDirection, TProjectPermission } from "@app/lib/types";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import {
  TActiveDirectoryDiscoveryConfiguration,
  TActiveDirectoryDiscoveryCredentials,
  TActiveDirectoryDiscoverySource
} from "./active-directory/active-directory-discovery-types";
import { PamDiscoveryOrderBy, PamDiscoveryRunTrigger, PamDiscoveryType } from "./pam-discovery-enums";
import { TPamDiscoveryScanDeps } from "./pam-discovery-factory";

export type TPamDiscoverySource = TActiveDirectoryDiscoverySource;
export type TPamDiscoveryCredentials = TActiveDirectoryDiscoveryCredentials;
export type TPamDiscoveryConfiguration = TActiveDirectoryDiscoveryConfiguration;

// Discovery Source DTOs
export type TCreatePamDiscoverySourceDTO = Pick<
  TPamDiscoverySource,
  "name" | "projectId" | "discoveryType" | "discoveryConfiguration" | "schedule" | "gatewayId"
> & {
  discoveryCredentials: TPamDiscoveryCredentials;
};

export type TUpdatePamDiscoverySourceDTO = Partial<
  Omit<TCreatePamDiscoverySourceDTO, "projectId" | "discoveryType">
> & {
  discoverySourceId: string;
};

export type TListPamDiscoverySourcesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  search?: string;
  orderBy?: PamDiscoveryOrderBy;
  orderDirection?: OrderByDirection;
  filterDiscoveryTypes?: string[];
} & Omit<TProjectPermission, "projectId">;

// Discovery Run DTOs
export type TGetPamDiscoveryRunsDTO = {
  discoverySourceId: string;
  offset?: number;
  limit?: number;
};

export type TGetPamDiscoveryRunDTO = {
  discoverySourceId: string;
  runId: string;
};

// Discovered items DTOs
export type TGetDiscoveredResourcesDTO = {
  discoverySourceId: string;
  offset?: number;
  limit?: number;
};

export type TGetDiscoveredAccountsDTO = {
  discoverySourceId: string;
  offset?: number;
  limit?: number;
};

// Factory
export type TPamDiscoveryFactory<T extends TPamDiscoveryConfiguration, C extends TPamDiscoveryCredentials> = (
  discoveryType: PamDiscoveryType,
  configuration: T,
  credentials: C,
  gatewayId: string,
  projectId: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  validateConnection: () => Promise<void>;
  scan: (discoverySourceId: string, triggeredBy: PamDiscoveryRunTrigger, deps: TPamDiscoveryScanDeps) => Promise<void>;
};
