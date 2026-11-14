import { AUDIT_LOG_EVENT_CLASS_DEFAULTS } from "@app/hooks/api/auditLogSettings/constants";
import { AuditLogEventClass, type TAuditLogSettings } from "@app/hooks/api/auditLogSettings/types";
import {
  AuditLogStreamProduct,
  LogProvider,
  REDACTED_CREDENTIAL_VALUE,
  StreamMode
} from "@app/hooks/api/auditLogStreams/enums";
import type { TAuditLogStream } from "@app/hooks/api/auditLogStreams/types";
import type { Project } from "@app/hooks/api/projects/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { AuditLogsAdapter } from "./contract";

const defaults = (): TAuditLogSettings => ({
  shouldUseNewPrivilegeSystem: true,
  eventClasses: Object.values(AuditLogEventClass).map((eventClass) => ({
    eventClass,
    isEnabled: AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass]
  }))
});

const settings = createFixtureStore<Record<string, TAuditLogSettings>>({});

const day = 24 * 3600 * 1000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
const root = (id: string, daysAgo: number) => ({
  id,
  orgId: "demo-org",
  createdAt: at(daysAgo),
  updatedAt: at(daysAgo),
  streamMode: StreamMode.Batch,
  filters: null,
  failingSince: null,
  lastDeliveryError: null
});

const streams = createFixtureStore<TAuditLogStream[]>([
  {
    ...root("stream-datadog", 64),
    provider: LogProvider.Datadog,
    credentials: {
      url: "https://http-intake.logs.datadoghq.com/api/v2/logs",
      token: REDACTED_CREDENTIAL_VALUE
    }
  },
  {
    ...root("stream-splunk", 41),
    provider: LogProvider.Splunk,
    filters: {
      products: [
        AuditLogStreamProduct.SecretManager,
        AuditLogStreamProduct.PAM,
        AuditLogStreamProduct.Organization
      ]
    },
    credentials: { hostname: "splunk.acme.internal", port: 8088, token: REDACTED_CREDENTIAL_VALUE }
  },
  {
    ...root("stream-azure", 23),
    provider: LogProvider.Azure,
    filters: { products: [AuditLogStreamProduct.KMS] },
    credentials: {
      tenantId: "4f1c2a9e-7b3d-4e8a-9c21-6d0f5b8e3a17",
      clientId: "b7e2d4c1-9a6f-4d3b-8e15-2c7a9f0d6b48",
      clientSecret: REDACTED_CREDENTIAL_VALUE,
      dceUrl: "https://acme-logs.eastus-1.ingest.monitor.azure.com",
      dcrId: "dcr-9f3c1a7e5b2d4c8a6e0f1b3d5c7a9e2f",
      cltName: "InfisicalLogs"
    }
  },
  {
    ...root("stream-custom", 9),
    provider: LogProvider.Custom,
    streamMode: StreamMode.Single,
    failingSince: at(1),
    lastDeliveryError: "Request to https://siem.acme.dev/ingest returned 503 Service Unavailable",
    credentials: {
      url: "https://siem.acme.dev/ingest",
      headers: [{ key: "Authorization", value: REDACTED_CREDENTIAL_VALUE }]
    }
  }
] as TAuditLogStream[]);

const streamOptions = [
  { name: "Azure", provider: LogProvider.Azure },
  { name: "Cribl", provider: LogProvider.Cribl },
  { name: "Custom", provider: LogProvider.Custom },
  { name: "Datadog", provider: LogProvider.Datadog },
  { name: "Splunk", provider: LogProvider.Splunk },
  { name: "Sumo Logic", provider: LogProvider.SumoLogic }
] as const;

export const auditLogsDemo: AuditLogsAdapter = {
  usePlan: () => ({
    data: { auditLogs: true, auditLogsRetentionDays: 90, auditLogStreams: true },
    isPending: false,
    error: null
  }),
  useStorage: () => ({
    data: { storageDisabled: false, volumeWarning: false },
    isPending: false,
    error: null
  }),
  usePamProjectId: () => ({ data: "pam", isPending: false, error: null }),
  useProjectSettings: (projectId) => ({
    data: settings.use()[projectId] ?? defaults(),
    isPending: false,
    error: null
  }),
  useUpdateProjectSettings: fixtureMutation(({ projectId, eventClasses }) => {
    const next = { ...(settings.get()[projectId] ?? defaults()), eventClasses };
    settings.update((current) => ({ ...current, [projectId]: next }));
    return next;
  }),
  useUpdateProjectRetention: fixtureMutation(
    ({ projectId, auditLogsRetentionDays }) =>
      ({ id: projectId, auditLogsRetentionDays }) as Project
  ),
  useStreams: () => ({ data: streams.use(), isPending: false, error: null }),
  useStreamOptions: () => ({ data: [...streamOptions], isPending: false, error: null }),
  useCreateStream: fixtureMutation(({ provider, credentials, filters }) => {
    const created = {
      ...root(`stream-${Date.now()}`, 0),
      provider,
      credentials,
      filters: filters ?? null
    } as TAuditLogStream;
    streams.update((current) => [...current, created]);
    return created;
  }),
  useUpdateStream: fixtureMutation(({ auditLogStreamId, credentials, filters, streamMode }) => {
    const current = streams.get().find((stream) => stream.id === auditLogStreamId)!;
    const updated = {
      ...current,
      credentials,
      filters: filters ?? null,
      streamMode: streamMode ?? current.streamMode,
      updatedAt: new Date().toISOString()
    } as TAuditLogStream;
    streams.update((list) =>
      list.map((stream) => (stream.id === auditLogStreamId ? updated : stream))
    );
    return updated;
  }),
  useDeleteStream: fixtureMutation(({ auditLogStreamId }) => {
    const deleted = streams.get().find((stream) => stream.id === auditLogStreamId)!;
    streams.update((list) => list.filter((stream) => stream.id !== auditLogStreamId));
    return deleted;
  })
};
