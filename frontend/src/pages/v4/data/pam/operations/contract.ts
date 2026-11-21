import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type {
  TPamAccountTemplateWithCount,
  TPamDiscoveredAccount,
  TPamDiscoveryRun,
  TPamDiscoverySource,
  TPamSession,
  TPamSessionLog,
  TPamStaleAccount,
  useCreatePamAccountTemplate,
  useCreatePamDiscoverySource,
  useDeletePamAccountTemplate,
  useDeletePamDiscoverySource,
  useGetPamAccountTemplate,
  useGetPamSessionById,
  useImportPamDiscoveredAccounts,
  useListPamAccountTemplates,
  useListPamDiscoverySources,
  useListPamDiscoveryTypes,
  useListPamSessions,
  useTerminatePamSession,
  useTriggerPamDiscoveryScan,
  useUpdatePamAccountTemplate,
  useUpdatePamDiscoverySource
} from "@app/hooks/api/pam";
import type { TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback/types";

import type { MutationOf, QueryOf } from "../../access/contract";
import type { V4QueryResult } from "../../contract";

export type TPamTemplatesParams = NonNullable<Parameters<typeof useListPamAccountTemplates>[0]>;
export type TPamDiscoverySourcesParams = NonNullable<
  Parameters<typeof useListPamDiscoverySources>[0]
>;
export type TPamSessionsParams = NonNullable<Parameters<typeof useListPamSessions>[1]>;
export type TPamPageParams = { search?: string; offset?: number; limit?: number };

export type TPamRecordingConnection = TAvailableAppConnection & {
  app: AppConnection;
  providerName: string;
};

export type PamOperationsAdapter = {
  useTemplates: (params?: TPamTemplatesParams) => V4QueryResult<TPamAccountTemplateWithCount[]>;
  useTemplate: QueryOf<typeof useGetPamAccountTemplate>;
  useCreateTemplate: MutationOf<typeof useCreatePamAccountTemplate>;
  useUpdateTemplate: MutationOf<typeof useUpdatePamAccountTemplate>;
  useDeleteTemplate: MutationOf<typeof useDeletePamAccountTemplate>;
  useRecordingConnections: (projectId: string) => V4QueryResult<TPamRecordingConnection[]>;

  useDiscoveryTypes: QueryOf<typeof useListPamDiscoveryTypes>;
  useDiscoverySources: (
    params?: TPamDiscoverySourcesParams
  ) => V4QueryResult<TPamDiscoverySource[]>;
  useDiscoveryRuns: (
    sourceId: string,
    options?: { refetchInterval?: number }
  ) => V4QueryResult<TPamDiscoveryRun[]>;
  useDiscoveredAccounts: (
    sourceId: string,
    params?: TPamPageParams
  ) => V4QueryResult<{ discoveredAccounts: TPamDiscoveredAccount[]; totalCount: number }>;
  useStaleAccounts: (
    sourceId: string,
    params?: TPamPageParams
  ) => V4QueryResult<{ accounts: TPamStaleAccount[]; totalCount: number }>;
  useCreateDiscoverySource: MutationOf<typeof useCreatePamDiscoverySource>;
  useUpdateDiscoverySource: MutationOf<typeof useUpdatePamDiscoverySource>;
  useDeleteDiscoverySource: MutationOf<typeof useDeletePamDiscoverySource>;
  useTriggerDiscoveryScan: MutationOf<typeof useTriggerPamDiscoveryScan>;
  useImportDiscoveredAccounts: MutationOf<typeof useImportPamDiscoveredAccounts>;

  useSessions: (
    projectId: string,
    params?: TPamSessionsParams
  ) => V4QueryResult<{ sessions: TPamSession[]; totalCount: number }>;
  useSession: (sessionId: string) => ReturnType<QueryOf<typeof useGetPamSessionById>>;
  useSessionLogs: (
    sessionId: string,
    enabled: boolean,
    isActive: boolean
  ) => V4QueryResult<(TPamSessionLog | TBrokenChunkMarker)[]>;
  useTerminateSession: MutationOf<typeof useTerminatePamSession>;
};
