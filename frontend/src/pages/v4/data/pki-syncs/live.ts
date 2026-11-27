import { useCloudflareConnectionListZones } from "@app/hooks/api/appConnections/cloudflare/queries";
import {
  useGcpConnectionListCertificateManagerLocations,
  useGcpConnectionListCertificateManagerProjects,
  useGcpConnectionListCertificateMaps
} from "@app/hooks/api/appConnections/gcp/queries";
import { useLdapConnectionListMachines } from "@app/hooks/api/appConnections/ldap/queries";
import { useNutanixPrismCentralConnectionListClusters } from "@app/hooks/api/appConnections/nutanix-prism-central/queries";
import {
  usePaloAltoNetworksConnectionListCertificates,
  usePaloAltoNetworksConnectionListSslTlsServiceProfiles,
  usePaloAltoNetworksConnectionListTemplates
} from "@app/hooks/api/appConnections/palo-alto-networks/queries";
import { useListAvailableAppConnectionsForApps } from "@app/hooks/api/appConnections/queries";
import {
  useAddCertificatesToPkiSync,
  useClearDefaultCertificate,
  useCreatePkiSync,
  useDeletePkiSync,
  usePreviewPkiSyncFilters,
  useRemoveCertificatesFromPkiSync,
  useRunPkiSyncHealthCheck,
  useSetCertificateAsDefault,
  useTestPkiSyncHealthCheck,
  useTriggerPkiSyncImportCertificates,
  useTriggerPkiSyncRemoveCertificates,
  useTriggerPkiSyncSyncCertificates,
  useUpdatePkiSync
} from "@app/hooks/api/pkiSyncs/mutations";
import {
  useGetPkiSync,
  useListAwsListeners,
  useListAwsLoadBalancers,
  useListImpervaSites,
  useListKempVirtualServices,
  useListPkiSyncCertificates,
  useListPkiSyncs,
  useListPkiSyncsWithCertificate,
  usePkiSyncCertificateOrders,
  usePkiSyncOptions,
  usePkiSyncPreviewCertificates
} from "@app/hooks/api/pkiSyncs/queries";

import type { PkiSyncsAdapter } from "./contract";

export const pkiSyncsLive: PkiSyncsAdapter = {
  useSyncs: useListPkiSyncs,
  useSyncsWithCertificate: useListPkiSyncsWithCertificate,
  useSync: useGetPkiSync,
  useSyncOptions: usePkiSyncOptions,
  useSyncCertificates: useListPkiSyncCertificates,
  usePreviewCertificates: usePkiSyncPreviewCertificates,
  useCertificateOrders: usePkiSyncCertificateOrders,
  useAvailableConnections: useListAvailableAppConnectionsForApps,
  useAwsLoadBalancers: useListAwsLoadBalancers,
  useAwsListeners: useListAwsListeners,
  useKempVirtualServices: useListKempVirtualServices,
  useImpervaSites: useListImpervaSites,
  useCloudflareZones: useCloudflareConnectionListZones,
  usePaloAltoTemplates: usePaloAltoNetworksConnectionListTemplates,
  usePaloAltoSslTlsProfiles: usePaloAltoNetworksConnectionListSslTlsServiceProfiles,
  usePaloAltoCertificates: usePaloAltoNetworksConnectionListCertificates,
  useNutanixClusters: useNutanixPrismCentralConnectionListClusters,
  useLdapMachines: useLdapConnectionListMachines,
  useGcpProjects: useGcpConnectionListCertificateManagerProjects,
  useGcpLocations: useGcpConnectionListCertificateManagerLocations,
  useGcpCertificateMaps: useGcpConnectionListCertificateMaps,
  useCreateSync: useCreatePkiSync,
  useUpdateSync: useUpdatePkiSync,
  useDeleteSync: useDeletePkiSync,
  useTriggerSync: useTriggerPkiSyncSyncCertificates,
  useTriggerImport: useTriggerPkiSyncImportCertificates,
  useTriggerRemove: useTriggerPkiSyncRemoveCertificates,
  useTestHealthCheck: useTestPkiSyncHealthCheck,
  useRunHealthCheck: useRunPkiSyncHealthCheck,
  usePreviewFilters: usePreviewPkiSyncFilters,
  useAddCertificates: useAddCertificatesToPkiSync,
  useRemoveCertificates: useRemoveCertificatesFromPkiSync,
  useSetDefaultCertificate: useSetCertificateAsDefault,
  useClearDefaultCertificate
};
