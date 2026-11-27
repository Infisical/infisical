import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { APP_CONNECTION_MAP, getAppConnectionProviderName } from "@app/helpers/appConnections";
import {
  useListAppConnections,
  useListAvailableAppConnectionsForApps
} from "@app/hooks/api/appConnections/queries";
import {
  pamKeys,
  useCreatePamAccountTemplate,
  useCreatePamDiscoverySource,
  useDeletePamAccountTemplate,
  useDeletePamDiscoverySource,
  useGetPamAccountTemplate,
  useGetPamSessionById,
  useImportPamDiscoveredAccounts,
  useListPamAccountTemplates,
  useListPamDiscoveredAccounts,
  useListPamDiscoveryRuns,
  useListPamDiscoverySources,
  useListPamDiscoveryTypes,
  useListPamSessions,
  useListPamStaleAccounts,
  useTerminatePamSession,
  useTriggerPamDiscoveryScan,
  useUpdatePamAccountTemplate,
  useUpdatePamDiscoverySource
} from "@app/hooks/api/pam";
import { PAM_RECORDING_CONNECTION_APPS } from "@app/hooks/api/pam/constants";
import { useDecryptedSessionLogs } from "@app/hooks/api/pam/session-playback/queries";

import type { PamOperationsAdapter } from "./contract";

export const pamOperationsLive: PamOperationsAdapter = {
  useTemplates: useListPamAccountTemplates,
  useTemplate: useGetPamAccountTemplate,
  useCreateTemplate: useCreatePamAccountTemplate,
  useUpdateTemplate: () => useUpdatePamAccountTemplate({ skipValidationToast: true }),
  useDeleteTemplate: useDeletePamAccountTemplate,
  useRecordingConnections: (projectId) => {
    const { connections, isPending } = useListAvailableAppConnectionsForApps(
      PAM_RECORDING_CONNECTION_APPS,
      projectId
    );
    const { data: appConnections = [] } = useListAppConnections();
    const data = useMemo(
      () =>
        connections.map((connection) => {
          const full = appConnections.find(({ id }) => id === connection.id);
          return {
            ...connection,
            providerName: full
              ? getAppConnectionProviderName(full)
              : APP_CONNECTION_MAP[connection.app].name
          };
        }),
      [connections, appConnections]
    );
    return { data, isPending, error: null };
  },

  useDiscoveryTypes: useListPamDiscoveryTypes,
  useDiscoverySources: useListPamDiscoverySources,
  useDiscoveryRuns: (sourceId, options) => {
    const query = useListPamDiscoveryRuns(sourceId, options);
    const queryClient = useQueryClient();
    const latestStatus = query.data?.[0]?.status;
    const previousStatus = useRef(latestStatus);
    useEffect(() => {
      if (previousStatus.current === "running" && latestStatus && latestStatus !== "running") {
        queryClient.invalidateQueries({
          queryKey: [...pamKeys.discovery(), "discovered", sourceId]
        });
        queryClient.invalidateQueries({ queryKey: [...pamKeys.discovery(), "stale", sourceId] });
        queryClient.invalidateQueries({ queryKey: [...pamKeys.discovery(), "sources"] });
        queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      }
      previousStatus.current = latestStatus;
    }, [latestStatus, sourceId, queryClient]);
    return query;
  },
  useDiscoveredAccounts: useListPamDiscoveredAccounts,
  useStaleAccounts: useListPamStaleAccounts,
  useCreateDiscoverySource: useCreatePamDiscoverySource,
  useUpdateDiscoverySource: useUpdatePamDiscoverySource,
  useDeleteDiscoverySource: useDeletePamDiscoverySource,
  useTriggerDiscoveryScan: useTriggerPamDiscoveryScan,
  useImportDiscoveredAccounts: useImportPamDiscoveredAccounts,

  useSessions: useListPamSessions,
  useSession: (sessionId) => useGetPamSessionById(sessionId),
  useSessionLogs: (sessionId, enabled, isActive) => {
    const { events, loading, error } = useDecryptedSessionLogs(sessionId, enabled, isActive);
    return { data: events, isPending: loading, error: error ?? null };
  },
  useTerminateSession: useTerminatePamSession
};
