import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";

import { PamAccountType } from "../pam/pam-enums";
import { TActorContext } from "../pam/pam-permission";
import { PamDiscoverySchedule, PamDiscoveryType } from "./pam-discovery-enums";

export type TDiscoveredAccount = {
  accountType: PamAccountType;
  name: string;
  fingerprint: string;
  details: Record<string, unknown>;
};

export type TDiscoveryMachineError = { machine: string; error: string };

export type TDiscoveredDependency = {
  fingerprint: string; // run-as stable identity (domain:objectGUID / SID); anchors the dependency to an account
  type: string; // windows-service / scheduled-task / iis-app-pool
  name: string;
  machine: string;
  data: Record<string, unknown>; // type-specific detail (run-as, path, triggers, etc.)
};

export type TDiscoveryScanResult = {
  accounts: TDiscoveredAccount[];
  machineErrors: TDiscoveryMachineError[];
  dependencies: TDiscoveredDependency[];
  // Machines whose dependency sweep completed, so reconciliation only prunes what it actually re-checked.
  scannedDependencyMachines: string[];
};

export type TPamDiscoveryProvider = {
  validateConnection: () => Promise<void>;
  scan: (signal: AbortSignal) => Promise<TDiscoveryScanResult>;
};

export type TDiscoveryCredentialAccount = {
  accountType: PamAccountType;
  connectionDetails: Record<string, unknown>;
  credentials: Record<string, unknown>;
};

export type TPamDiscoveryFactoryInput = {
  projectId: string;
  gatewayId: string;
  configuration: Record<string, unknown>;
  credentialAccounts: TDiscoveryCredentialAccount[];
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
};

export type TPamDiscoveryFactory = (input: TPamDiscoveryFactoryInput) => TPamDiscoveryProvider;

export type TCreateDiscoverySourceDTO = {
  projectId: string;
  discoveryType: PamDiscoveryType;
  name: string;
  credentialAccountId: string;
  gatewayId?: string;
  gatewayPoolId?: string;
  schedule: PamDiscoverySchedule;
  configuration: Record<string, unknown>;
} & TActorContext;

export type TUpdateDiscoverySourceDTO = {
  projectId: string;
  sourceId: string;
  discoveryType: PamDiscoveryType;
  name?: string;
  credentialAccountId?: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  schedule?: PamDiscoverySchedule;
  configuration?: Record<string, unknown>;
} & TActorContext;

export type TDeleteDiscoverySourceDTO = {
  projectId: string;
  sourceId: string;
  discoveryType: PamDiscoveryType;
} & TActorContext;
export type TGetDiscoverySourceDTO = {
  projectId: string;
  sourceId: string;
  discoveryType: PamDiscoveryType;
} & TActorContext;
export type TListDiscoverySourcesDTO = { projectId: string; search?: string } & TActorContext;
export type TTriggerScanDTO = {
  projectId: string;
  sourceId: string;
  discoveryType: PamDiscoveryType;
} & TActorContext;
export type TListRunsDTO = { projectId: string; sourceId: string; offset?: number; limit?: number } & TActorContext;
export type TListDiscoveredDTO = {
  projectId: string;
  sourceId: string;
  search?: string;
  offset?: number;
  limit?: number;
} & TActorContext;

export type TImportDiscoveredDTO = {
  projectId: string;
  sourceId: string;
  folderId: string;
  accounts: { discoveredAccountId: string; templateId: string; name?: string }[];
} & TActorContext;

export type TListAccountDependenciesDTO = {
  projectId: string;
  accountId: string;
} & TActorContext;
