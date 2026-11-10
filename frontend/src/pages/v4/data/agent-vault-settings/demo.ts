import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultSessionLogReadCheck,
  TAgentVaultSessionLogSettingsState
} from "@app/hooks/api/agentVault/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { AgentVaultSettingsAdapter, TSessionLogPlan } from "./contract";

const PLATFORM = "agent-platform";
const ORG_CONNECTION_ID = "8f2c6a1e-4b7d-4e3a-9c51-2d6e8f0a1b37";
const PLATFORM_CONNECTION_ID = "4d9e1b6c-7a2f-4c8e-b3d5-6f0a2c4e8b19";

const plan: TSessionLogPlan = {
  agentVaultManagedStorage: true,
  agentVaultByoS3: true,
  agentVaultSessionLogRetentionDays: 30
};

const connection = (
  id: string,
  name: string,
  method: AwsConnectionMethod,
  createdAt: string,
  projectId: string | null,
  description: string | null = null
) =>
  ({
    id,
    app: AppConnection.AWS,
    name,
    method,
    credentials: {},
    description,
    version: 1,
    orgId: V4_DEMO_ORG_ID,
    projectId,
    createdAt,
    updatedAt: createdAt
  }) as TAppConnection;

const connections = createFixtureStore<TAppConnection[]>([
  connection(
    ORG_CONNECTION_ID,
    "aws-production",
    AwsConnectionMethod.AssumeRole,
    "2025-09-14T10:20:00Z",
    null,
    "Production account 4417"
  ),
  connection(
    PLATFORM_CONNECTION_ID,
    "aws-agent-logs",
    AwsConnectionMethod.AssumeRole,
    "2026-10-31T09:12:00Z",
    PLATFORM,
    "Writes agent session logs to the platform bucket"
  ),
  connection(
    "b5a3e7c1-0d2f-4a6b-8e9c-1f3d5b7a9c20",
    "aws-agent-logs-legacy",
    AwsConnectionMethod.AccessKey,
    "2026-11-01T16:40:00Z",
    PLATFORM
  )
]);

const settings = createFixtureStore<Record<string, TAgentVaultSessionLogSettingsState>>({
  [PLATFORM]: {
    settings: {
      enabled: true,
      storage: {
        type: AgentVaultSessionLogStorageType.External,
        appConnectionId: PLATFORM_CONNECTION_ID,
        bucket: "acme-agent-session-logs",
        region: "us-east-1",
        keyPrefix: "agent-platform"
      }
    },
    defaultStorage: { configured: true }
  }
});

const emptyState: TAgentVaultSessionLogSettingsState = {
  settings: { enabled: false, storage: { type: AgentVaultSessionLogStorageType.Default } },
  defaultStorage: { configured: true }
};

const readableBuckets = createFixtureStore<string[]>([]);

const stateOf = (all: Record<string, TAgentVaultSessionLogSettingsState>, projectId: string) =>
  all[projectId] ?? emptyState;

const readCheckOf = (projectId: string): TAgentVaultSessionLogReadCheck | null => {
  const saved = stateOf(settings.get(), projectId).settings;
  if (!saved?.enabled || saved.storage.type !== AgentVaultSessionLogStorageType.External)
    return null;
  const { bucket, region } = saved.storage;
  return {
    status: readableBuckets.get().includes(bucket) ? "readable" : "cors-missing",
    host: `${bucket}.s3.${region}.amazonaws.com`
  };
};

export const agentVaultSettingsDemo: AgentVaultSettingsAdapter = {
  useSessionLogPlan: () => ({ data: plan, isPending: false, error: null }),
  useSessionLogSettings: (_, projectId) => ({
    data: stateOf(settings.use(), projectId),
    isPending: false,
    error: null
  }),
  useSessionLogHealth: () => ({ data: { connectionError: null }, isPending: false, error: null }),
  useSessionLogReadCheck: (_, projectId, enabled = true) => {
    settings.use();
    readableBuckets.use();
    return { data: enabled ? readCheckOf(projectId) : undefined, isPending: false, error: null };
  },
  useSessionLogReadCheckActions: (_, projectId) => ({
    fetch: async () => readCheckOf(projectId),
    recheck: () => {
      const saved = stateOf(settings.get(), projectId).settings;
      if (saved?.storage.type !== AgentVaultSessionLogStorageType.External) return;
      const { bucket } = saved.storage;
      readableBuckets.update((current) => [...new Set([...current, bucket])]);
    }
  }),
  useUpdateSessionLogSettings: (_, projectId) => ({
    isPending: false,
    mutateAsync: async (request) => {
      const current = stateOf(settings.get(), projectId);
      const next: TAgentVaultSessionLogSettingsState = {
        ...current,
        settings: request.enabled
          ? {
              enabled: true,
              storage:
                request.storage.type === AgentVaultSessionLogStorageType.Default
                  ? request.storage
                  : { ...request.storage, keyPrefix: request.storage.keyPrefix || null }
            }
          : {
              enabled: false,
              storage: { type: AgentVaultSessionLogStorageType.Default }
            }
      };
      settings.update((all) => ({ ...all, [projectId]: next }));
      return next;
    }
  }),
  useProjectConnections: (projectId) => ({
    data: connections.use().filter((entry) => entry.projectId === projectId),
    isPending: false,
    error: null
  }),
  useAvailableConnections: (app, projectId) => ({
    data: connections
      .use()
      .filter((entry) => entry.app === app && (!entry.projectId || entry.projectId === projectId))
      .map(({ id, name, projectId: owner }) => ({ id, name, projectId: owner })),
    isPending: false,
    error: null
  }),
  useCreateConnection: fixtureMutation((input) => {
    const created = connection(
      crypto.randomUUID(),
      input.name,
      input.method as AwsConnectionMethod,
      new Date().toISOString(),
      input.projectId ?? null,
      input.description ?? null
    );
    connections.update((entries) => [...entries, created]);
    return created;
  }),
  useUpdateConnection: fixtureMutation(({ connectionId, name, description }) => {
    connections.update((entries) =>
      entries.map((entry) =>
        entry.id === connectionId
          ? {
              ...entry,
              name: name ?? entry.name,
              description: description === undefined ? entry.description : description,
              updatedAt: new Date().toISOString()
            }
          : entry
      )
    );
    return connections.get().find((entry) => entry.id === connectionId) as TAppConnection;
  }),
  useDeleteConnection: fixtureMutation(({ connectionId }) => {
    const removed = connections.get().find((entry) => entry.id === connectionId) as TAppConnection;
    connections.update((entries) => entries.filter((entry) => entry.id !== connectionId));
    return removed;
  })
};
