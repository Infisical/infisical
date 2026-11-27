import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type {
  TCreatePkiDiscoveryDTO,
  TDeletePkiDiscoveryDTO,
  TDeletePkiInstallationDTO,
  TGetScanHistoryDTO,
  TGetScanHistoryResponse,
  TListPkiDiscoveriesDTO,
  TListPkiDiscoveriesResponse,
  TListPkiInstallationsDTO,
  TListPkiInstallationsResponse,
  TPkiDiscovery,
  TPkiInstallation,
  TTriggerPkiDiscoveryScanDTO,
  TTriggerPkiDiscoveryScanResponse,
  TUpdatePkiDiscoveryDTO,
  TUpdatePkiInstallationDTO
} from "@app/hooks/api/pkiDiscovery/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TPollingOptions = { refetchInterval?: number | false };

export type THostConnection = TAvailableAppConnection & { app: AppConnection };

/** Every mutation here announces its own success, as main's hooks do. */
export type PkiDiscoveryAdapter = {
  useSubscription: (orgId: string) => V4QueryResult<SubscriptionPlan>;
  useDiscoveries: (dto: TListPkiDiscoveriesDTO) => V4QueryResult<TListPkiDiscoveriesResponse>;
  useDiscovery: (discoveryId: string) => V4QueryResult<TPkiDiscovery>;
  useScanHistory: (
    dto: TGetScanHistoryDTO,
    options?: TPollingOptions
  ) => V4QueryResult<TGetScanHistoryResponse>;
  /** Refreshes scan runs and installations once a running scan finishes. */
  useRefreshAfterScan: (discoveryId: string, projectId: string, isScanRunning: boolean) => void;
  useInstallations: (
    dto: TListPkiInstallationsDTO,
    options?: TPollingOptions
  ) => V4QueryResult<TListPkiInstallationsResponse>;
  useInstallation: (
    dto: { installationId: string },
    options?: { refetchInterval: (installation?: TPkiInstallation) => number | false }
  ) => V4QueryResult<TPkiInstallation>;
  useHostConnections: (
    apps: AppConnection[],
    projectId: string
  ) => { connections: THostConnection[]; isPending: boolean };
  useCreateDiscovery: V4Mutation<TCreatePkiDiscoveryDTO, TPkiDiscovery>;
  useUpdateDiscovery: V4Mutation<TUpdatePkiDiscoveryDTO, TPkiDiscovery>;
  useDeleteDiscovery: V4Mutation<TDeletePkiDiscoveryDTO, TPkiDiscovery>;
  useTriggerScan: V4Mutation<
    TTriggerPkiDiscoveryScanDTO & { projectId: string },
    TTriggerPkiDiscoveryScanResponse
  >;
  useUpdateInstallation: V4Mutation<
    TUpdatePkiInstallationDTO & { projectId: string },
    TPkiInstallation
  >;
  useDeleteInstallation: V4Mutation<
    TDeletePkiInstallationDTO & { projectId: string },
    TPkiInstallation
  >;
};
