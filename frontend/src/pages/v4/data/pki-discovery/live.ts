import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useListAvailableAppConnectionsForApps } from "@app/hooks/api/appConnections/queries";
import {
  useCreatePkiDiscovery,
  useDeletePkiDiscovery,
  useDeletePkiInstallation,
  useTriggerPkiDiscoveryScan,
  useUpdatePkiDiscovery,
  useUpdatePkiInstallation
} from "@app/hooks/api/pkiDiscovery/mutations";
import {
  pkiDiscoveryKeys,
  pkiInstallationKeys,
  useGetPkiDiscovery,
  useGetPkiInstallation,
  useGetScanHistory,
  useListPkiDiscoveries,
  useListPkiInstallations
} from "@app/hooks/api/pkiDiscovery/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { PkiDiscoveryAdapter } from "./contract";

export const pkiDiscoveryLive: PkiDiscoveryAdapter = {
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useDiscoveries: useListPkiDiscoveries,
  useDiscovery: (discoveryId) => useGetPkiDiscovery({ discoveryId }),
  useScanHistory: useGetScanHistory,
  useRefreshAfterScan: (discoveryId, projectId, isScanRunning) => {
    const queryClient = useQueryClient();
    const wasRunning = useRef(isScanRunning);
    useEffect(() => {
      if (wasRunning.current && !isScanRunning) {
        queryClient.invalidateQueries({
          queryKey: pkiDiscoveryKeys.scanHistoryByDiscovery(discoveryId)
        });
        queryClient.invalidateQueries({ queryKey: pkiInstallationKeys.list(projectId) });
      }
      wasRunning.current = isScanRunning;
    }, [isScanRunning, discoveryId, projectId, queryClient]);
  },
  useInstallations: useListPkiInstallations,
  useInstallation: useGetPkiInstallation,
  useHostConnections: useListAvailableAppConnectionsForApps,
  useCreateDiscovery: useCreatePkiDiscovery,
  useUpdateDiscovery: useUpdatePkiDiscovery,
  useDeleteDiscovery: useDeletePkiDiscovery,
  useTriggerScan: useTriggerPkiDiscoveryScan,
  useUpdateInstallation: useUpdatePkiInstallation,
  useDeleteInstallation: useDeletePkiInstallation
};
