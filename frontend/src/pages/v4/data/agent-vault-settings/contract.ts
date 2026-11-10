import type {
  TAgentVaultSessionLogHealth,
  TAgentVaultSessionLogReadCheck,
  TAgentVaultSessionLogSettingsState,
  TUpdateAgentVaultSessionLogSettingsDTO
} from "@app/hooks/api/agentVault/types";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type {
  TAppConnection,
  TAvailableAppConnection,
  TCreateAppConnectionDTO,
  TDeleteAppConnectionDTO,
  TUpdateAppConnectionDTO
} from "@app/hooks/api/appConnections/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TSessionLogPlan = Pick<
  SubscriptionPlan,
  "agentVaultManagedStorage" | "agentVaultByoS3" | "agentVaultSessionLogRetentionDays"
>;

export type AgentVaultSettingsAdapter = {
  useSessionLogPlan: (orgId: string) => V4QueryResult<TSessionLogPlan>;
  useSessionLogSettings: (
    orgId: string,
    projectId: string
  ) => V4QueryResult<TAgentVaultSessionLogSettingsState>;
  useSessionLogHealth: (
    orgId: string,
    projectId: string
  ) => V4QueryResult<TAgentVaultSessionLogHealth>;
  useSessionLogReadCheck: (
    orgId: string,
    projectId: string,
    enabled?: boolean
  ) => V4QueryResult<TAgentVaultSessionLogReadCheck | null>;
  useSessionLogReadCheckActions: (
    orgId: string,
    projectId: string
  ) => {
    fetch: () => Promise<TAgentVaultSessionLogReadCheck | null>;
    recheck: () => void;
  };
  useUpdateSessionLogSettings: (
    orgId: string,
    projectId: string
  ) => ReturnType<
    V4Mutation<TUpdateAgentVaultSessionLogSettingsDTO, TAgentVaultSessionLogSettingsState>
  >;
  useProjectConnections: (projectId: string) => V4QueryResult<TAppConnection[]>;
  useAvailableConnections: (
    app: AppConnection,
    projectId: string
  ) => V4QueryResult<TAvailableAppConnection[]>;
  useCreateConnection: V4Mutation<TCreateAppConnectionDTO, TAppConnection>;
  useUpdateConnection: V4Mutation<TUpdateAppConnectionDTO, TAppConnection>;
  useDeleteConnection: V4Mutation<TDeleteAppConnectionDTO, TAppConnection>;
};
