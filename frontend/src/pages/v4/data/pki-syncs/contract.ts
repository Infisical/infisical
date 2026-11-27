import type { TCloudflareZone } from "@app/hooks/api/appConnections/cloudflare/types";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type {
  TGcpCertificateMap,
  TGcpLocation,
  TGcpProject
} from "@app/hooks/api/appConnections/gcp/types";
import type { TLdapDirectoryMachine } from "@app/hooks/api/appConnections/ldap/queries";
import type { TNutanixCluster } from "@app/hooks/api/appConnections/nutanix-prism-central/queries";
import type {
  TPaloAltoNetworksCertificate,
  TPaloAltoNetworksSslTlsServiceProfile,
  TPaloAltoNetworksTemplates
} from "@app/hooks/api/appConnections/palo-alto-networks/queries";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import type {
  TAwsListener,
  TAwsLoadBalancer,
  TCreatePkiSyncDTO,
  TDeletePkiSyncDTO,
  TImpervaSite,
  TKempVirtualService,
  TPkiSync,
  TPkiSyncCertificate,
  TPkiSyncFilterPreview,
  TPkiSyncFilters,
  TPkiSyncHealthCheckResult,
  TPkiSyncOption,
  TPkiSyncPreviewCertificate,
  TTriggerPkiSyncImportCertificatesDTO,
  TTriggerPkiSyncRemoveCertificatesDTO,
  TTriggerPkiSyncSyncCertificatesDTO,
  TUpdatePkiSyncDTO
} from "@app/hooks/api/pkiSyncs/types";

import type { V4Mutation, V4QueryResult } from "../contract";

type Enabled = { enabled?: boolean };
type Polling = Enabled & { refetchInterval?: number };

export type TPkiSyncConnectionOption = TAvailableAppConnection & { app: AppConnection };

export type TPkiSyncPreviewArgs = {
  projectId: string;
  applicationId?: string | null;
  pkiSyncId?: string | null;
  filters?: TPkiSyncFilters | null;
  offset?: number;
  limit?: number;
  enabled?: boolean;
};

export type TPkiSyncPreview = {
  certificates: TPkiSyncPreviewCertificate[];
  totalCount: number;
  toUnlink: TPkiSyncFilterPreview["toUnlink"];
  willRemoveFromDestination: boolean;
};

export type TTestPkiSyncHealthCheckDTO = {
  destination: PkiSync;
  connectionId: string;
  applicationId?: string;
  syncId?: string;
  certificateIds?: string[];
  filters?: TPkiSyncFilters | null;
  destinationConfig: Record<string, unknown>;
  syncOptions: Record<string, unknown>;
};

export type TPkiSyncCertificatesDTO = { pkiSyncId: string; certificateIds: string[] };

export type PkiSyncsAdapter = {
  useSyncs: (
    projectId: string,
    options?: Polling & { applicationId?: string }
  ) => V4QueryResult<TPkiSync[]>;
  useSyncsWithCertificate: (
    projectId: string,
    certificateId: string,
    options?: Enabled,
    applicationId?: string
  ) => V4QueryResult<TPkiSync[]>;
  useSync: (
    args: { syncId: string; projectId: string },
    options?: Polling
  ) => V4QueryResult<TPkiSync>;
  useSyncOptions: (options?: Enabled) => V4QueryResult<TPkiSyncOption[]>;
  useSyncCertificates: (
    syncId: string,
    pagination?: { offset?: number; limit?: number },
    options?: Enabled
  ) => V4QueryResult<{ certificates: TPkiSyncCertificate[]; totalCount: number }>;
  usePreviewCertificates: (
    args: TPkiSyncPreviewArgs
  ) => V4QueryResult<TPkiSyncPreview> & { refetch: () => Promise<unknown>; isFetching: boolean };
  useCertificateOrders: (args: {
    applicationId?: string | null;
    pkiSyncId?: string | null;
    certificateOrderIds: string[];
  }) => V4QueryResult<Map<string, string>>;
  useAvailableConnections: (
    apps: AppConnection[],
    projectId: string
  ) => { connections: TPkiSyncConnectionOption[]; isPending: boolean };
  useAwsLoadBalancers: (
    args: { connectionId: string; region: string },
    options?: Enabled
  ) => V4QueryResult<TAwsLoadBalancer[]>;
  useAwsListeners: (
    args: { connectionId: string; region: string; loadBalancerArn: string },
    options?: Enabled
  ) => V4QueryResult<TAwsListener[]>;
  useKempVirtualServices: (
    args: { connectionId: string },
    options?: Enabled
  ) => V4QueryResult<TKempVirtualService[]>;
  useImpervaSites: (
    args: { connectionId: string },
    options?: Enabled
  ) => V4QueryResult<TImpervaSite[]>;
  useCloudflareZones: (connectionId: string, options?: Enabled) => V4QueryResult<TCloudflareZone[]>;
  usePaloAltoTemplates: (
    connectionId: string,
    options?: Enabled
  ) => V4QueryResult<TPaloAltoNetworksTemplates>;
  usePaloAltoSslTlsProfiles: (
    connectionId: string,
    template?: string,
    options?: Enabled
  ) => V4QueryResult<TPaloAltoNetworksSslTlsServiceProfile[]>;
  usePaloAltoCertificates: (
    connectionId: string,
    template?: string
  ) => V4QueryResult<TPaloAltoNetworksCertificate[]>;
  useNutanixClusters: (connectionId: string, options?: Enabled) => V4QueryResult<TNutanixCluster[]>;
  useLdapMachines: (
    connectionId: string,
    search?: string,
    options?: Enabled
  ) => V4QueryResult<TLdapDirectoryMachine[]>;
  useGcpProjects: (connectionId: string, options?: Enabled) => V4QueryResult<TGcpProject[]>;
  useGcpLocations: (
    args: { connectionId: string; gcpProjectId: string },
    options?: Enabled
  ) => V4QueryResult<TGcpLocation[]>;
  useGcpCertificateMaps: (
    args: { connectionId: string; gcpProjectId: string },
    options?: Enabled
  ) => V4QueryResult<TGcpCertificateMap[]>;
  useCreateSync: V4Mutation<TCreatePkiSyncDTO, TPkiSync>;
  useUpdateSync: V4Mutation<TUpdatePkiSyncDTO, TPkiSync>;
  useDeleteSync: V4Mutation<TDeletePkiSyncDTO, unknown>;
  useTriggerSync: V4Mutation<TTriggerPkiSyncSyncCertificatesDTO, unknown>;
  useTriggerImport: V4Mutation<TTriggerPkiSyncImportCertificatesDTO, unknown>;
  useTriggerRemove: V4Mutation<TTriggerPkiSyncRemoveCertificatesDTO, unknown>;
  useTestHealthCheck: V4Mutation<TTestPkiSyncHealthCheckDTO, TPkiSyncHealthCheckResult>;
  useRunHealthCheck: V4Mutation<
    { syncId: string; destination: PkiSync; projectId: string },
    TPkiSyncHealthCheckResult
  >;
  usePreviewFilters: V4Mutation<
    { pkiSyncId: string; filters?: TPkiSyncFilters | null },
    TPkiSyncFilterPreview
  >;
  useAddCertificates: V4Mutation<TPkiSyncCertificatesDTO, unknown>;
  useRemoveCertificates: V4Mutation<TPkiSyncCertificatesDTO, unknown>;
  useSetDefaultCertificate: V4Mutation<
    { pkiSyncId: string; certificateId: string; destination: string },
    { message: string }
  >;
  useClearDefaultCertificate: V4Mutation<
    { pkiSyncId: string; destination: string },
    { message: string }
  >;
};
