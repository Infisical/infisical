import {
  AlertChannelType,
  AlertPrincipalType,
  AlertRunStatus,
  CertificateAlertResourceType,
  CertificateManagerAlertEventType,
  SignerAlertEventType,
  type TAlert,
  type TAlertChannelEmbedded,
  type TAlertChannelInput,
  type TAlertFilterValue
} from "@app/hooks/api/alerts/types";
import { CertSource } from "@app/hooks/api/certificates/enums";
import type { TPkiApplicationListItem } from "@app/hooks/api/pkiApplications/types";
import type { OrgUser } from "@app/hooks/api/users/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { CertManagerAlertsAdapter } from "./contract-alerts";

const PROJECT_ID = "internal-pki";
const hoursAgo = (count: number) => new Date(Date.now() - count * 3_600_000).toISOString();

const application = (id: string, name: string, certificateCount: number) => ({
  id,
  projectId: PROJECT_ID,
  name,
  description: null,
  createdAt: "2026-04-02T10:00:00Z",
  updatedAt: "2026-04-02T10:00:00Z",
  profileCount: 2,
  memberCount: 4,
  certificateCount
});

const applications: TPkiApplicationListItem[] = [
  application("7d3e1a90-5b2c-4e8f-a1d6-3c9b0e7f2a41", "Payments API", 18),
  application("9a4f2b61-0c7d-4a3e-b8f5-6e1d2c9a7b52", "Edge gateway", 42),
  application("1c8e5d72-3f9a-4b6c-8d0e-7a2b5f1c9e63", "Internal tools", 7)
];

const orgUser = (
  id: string,
  firstName: string,
  lastName: string,
  email: string,
  status: OrgUser["status"] = "accepted",
  isActive = true
): OrgUser => ({
  id: `membership-${id}`,
  metadata: [],
  user: {
    id,
    username: email,
    email,
    isEmailVerified: true,
    firstName,
    lastName,
    publicKey: "",
    superAdmin: false
  },
  inviteEmail: email,
  organization: V4_DEMO_ORG_ID,
  role: "member",
  status,
  deniedPermissions: [],
  roleId: "member",
  isActive
});

const orgUsers: OrgUser[] = [
  orgUser("u-sarah", "Sarah", "Lin", "sarah@acme.dev"),
  orgUser("u-marcus", "Marcus", "Webb", "marcus@acme.dev"),
  orgUser("u-priya", "Priya", "Raman", "priya@acme.dev"),
  orgUser("u-diego", "Diego", "Alvarez", "diego@acme.dev"),
  orgUser("u-hana", "Hana", "Kim", "hana@acme.dev"),
  orgUser("u-tom", "Tom", "Becker", "tom@acme.dev", "invited"),
  orgUser("u-lena", "Lena", "Novak", "lena@acme.dev", "accepted", false)
];

const filterNames: Record<string, string> = {
  ...Object.fromEntries(applications.map(({ id, name }) => [id, name])),
  "4a6c2e81-0b3d-4f57-8e19-7d2a5c0f3b64": "tls-server",
  "b9e03d57-6f21-4c8a-91d4-2e7b8a6c0f15": "mtls-client",
  "e2c75a19-8d40-4b6e-a3f2-5c1d9e0b7a28": "code-signing",
  "5b1f7c3a-8e2d-4a69-b0c4-9d6e3f2a1b85": "release-signer",
  "c3a8e041-6d7b-4f12-9e5c-2b4f8a0d6e93": "firmware-signer"
};

const toFilters = (condition: TAlert["condition"]) =>
  Object.fromEntries(
    (["applicationIds", "profileIds", "signerIds", "sources"] as const).flatMap((kind) => {
      const ids: string[] = condition?.[kind] ?? [];
      return ids.length
        ? [[kind, ids.map((id): TAlertFilterValue => ({ id, name: filterNames[id] ?? null }))]]
        : [];
    })
  );

const savedFlag = (value: unknown, previous: unknown) =>
  value === null ? false : Boolean(value) || Boolean(previous);

const toStoredChannel = (
  input: TAlertChannelInput,
  previous?: TAlertChannelEmbedded
): TAlertChannelEmbedded => {
  const config = input.config ?? {};
  const before = previous?.config ?? {};
  const stored: Record<AlertChannelType, () => Record<string, unknown>> = {
    [AlertChannelType.Email]: () => ({}),
    [AlertChannelType.Slack]: () => ({
      hasWebhookUrl: savedFlag(config.webhookUrl, before.hasWebhookUrl)
    }),
    [AlertChannelType.Webhook]: () => {
      const urlChanged = Boolean(before.url) && before.url !== config.url;
      const keep = (field: string, flag: string) =>
        config.authType === before.authType && !urlChanged
          ? savedFlag(config[field], before[flag])
          : Boolean(config[field]);
      return {
        url: config.url,
        hasSigningSecret: savedFlag(config.signingSecret, before.hasSigningSecret),
        ...(config.authType
          ? {
              authType: config.authType,
              basicUsername: config.basicUsername,
              authHeaderName: config.authHeaderName,
              hasAuthCredentials: keep("authCredentials", "hasAuthCredentials"),
              hasBasicPassword: keep("basicPassword", "hasBasicPassword"),
              hasAuthHeaderValue: keep("authHeaderValue", "hasAuthHeaderValue")
            }
          : {}),
        headers: config.headers ?? []
      };
    },
    [AlertChannelType.PagerDuty]: () => ({
      hasIntegrationKey: savedFlag(config.integrationKey, before.hasIntegrationKey)
    })
  };
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    channelType: input.channelType,
    enabled: input.enabled ?? true,
    config: stored[input.channelType](),
    recipients: input.recipients ?? []
  };
};

const alert = (
  fields: Pick<TAlert, "id" | "name" | "eventType" | "resourceType" | "condition" | "channels"> &
    Partial<TAlert>
): TAlert => ({
  description: null,
  resourceId: null,
  enabled: true,
  orgId: V4_DEMO_ORG_ID,
  projectId: PROJECT_ID,
  resourceName: null,
  filters: toFilters(fields.condition),
  lastRun: null,
  createdAt: "2026-09-14T16:20:00Z",
  updatedAt: "2026-10-28T09:05:00Z",
  ...fields
});

const alerts = createFixtureStore<TAlert[]>([
  alert({
    id: "a1f3c5e7-2b4d-4f6a-8c0e-1d3f5a7c9e01",
    name: "TLS expiry, 30 days",
    description: "Warns the platform team before public TLS certificates lapse.",
    eventType: CertificateManagerAlertEventType.Expiry,
    resourceType: CertificateAlertResourceType.CertificateManager,
    condition: {
      alertBefore: "30d",
      dailyReminder: true,
      profileIds: ["4a6c2e81-0b3d-4f57-8e19-7d2a5c0f3b64"],
      sources: [CertSource.Issued, CertSource.Imported]
    },
    channels: [
      {
        id: "c1a2b3c4-0001-4000-8000-000000000001",
        name: "Email",
        channelType: AlertChannelType.Email,
        enabled: true,
        config: {},
        recipients: [
          { principalType: AlertPrincipalType.User, principalId: "u-sarah" },
          { principalType: AlertPrincipalType.User, principalId: "u-marcus" }
        ]
      },
      {
        id: "c1a2b3c4-0001-4000-8000-000000000002",
        name: "Slack",
        channelType: AlertChannelType.Slack,
        enabled: true,
        config: { hasWebhookUrl: true },
        recipients: []
      }
    ],
    lastRun: { timestamp: hoursAgo(2), status: AlertRunStatus.Success }
  }),
  alert({
    id: "b2e4d6f8-3c5e-4a7b-9d1f-2e4a6c8e0f12",
    name: "Payments issuance audit",
    eventType: CertificateManagerAlertEventType.Issuance,
    resourceType: CertificateAlertResourceType.CertificateManager,
    condition: { applicationIds: ["7d3e1a90-5b2c-4e8f-a1d6-3c9b0e7f2a41"] },
    channels: [
      {
        id: "c1a2b3c4-0002-4000-8000-000000000001",
        name: "Webhook",
        channelType: AlertChannelType.Webhook,
        enabled: true,
        config: {
          url: "https://hooks.acme.dev/pki/issuance",
          hasSigningSecret: true,
          authType: "bearer",
          hasAuthCredentials: true,
          headers: [{ key: "X-Env", value: "production" }]
        },
        recipients: []
      }
    ],
    lastRun: { timestamp: hoursAgo(26), status: AlertRunStatus.Partial }
  }),
  alert({
    id: "c3f5e7a9-4d6f-4b8c-ae20-3f5b7d9f1a23",
    name: "Release signer expiry",
    eventType: SignerAlertEventType.CertificateExpiry,
    resourceType: CertificateAlertResourceType.Signer,
    condition: {
      alertBefore: "2w",
      dailyReminder: false,
      signerIds: ["5b1f7c3a-8e2d-4a69-b0c4-9d6e3f2a1b85"]
    },
    channels: [
      {
        id: "c1a2b3c4-0003-4000-8000-000000000001",
        name: "PagerDuty",
        channelType: AlertChannelType.PagerDuty,
        enabled: true,
        config: { hasIntegrationKey: true },
        recipients: []
      }
    ],
    lastRun: { timestamp: hoursAgo(5), status: AlertRunStatus.Failed }
  }),
  alert({
    id: "d4a6f8b0-5e7a-4c9d-bf31-4a6c8e0a2b34",
    name: "Revocation notice",
    eventType: CertificateManagerAlertEventType.Revocation,
    resourceType: CertificateAlertResourceType.CertificateManager,
    enabled: false,
    condition: null,
    channels: [
      {
        id: "c1a2b3c4-0004-4000-8000-000000000001",
        name: "Email",
        channelType: AlertChannelType.Email,
        enabled: true,
        config: {},
        recipients: [
          { principalType: AlertPrincipalType.Email, principalId: "security@acme.dev" },
          { principalType: AlertPrincipalType.Group, principalId: "g-security" }
        ]
      }
    ]
  })
]);

const byId = (alertId: string) => alerts.get().find((entry) => entry.id === alertId) as TAlert;

export const alertsDemo: CertManagerAlertsAdapter = {
  useAlerts: ({ resourceType, projectId }) => ({
    data: alerts
      .use()
      .filter((entry) => entry.resourceType === resourceType && entry.projectId === projectId),
    isPending: false,
    error: null
  }),
  useCreateAlert: fixtureMutation((dto) => {
    const now = new Date().toISOString();
    const condition = (dto.condition ?? null) as TAlert["condition"];
    const created = alert({
      id: crypto.randomUUID(),
      name: dto.name,
      description: dto.description ?? null,
      eventType: dto.eventType,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId ?? null,
      enabled: dto.enabled ?? true,
      projectId: dto.projectId ?? PROJECT_ID,
      condition,
      channels: dto.channels.map((channel) => toStoredChannel(channel)),
      createdAt: now,
      updatedAt: now
    });
    alerts.update((entries) => [...entries, created]);
    return created;
  }),
  useUpdateAlert: fixtureMutation(({ alertId, channels, condition, ...patch }) => {
    alerts.update((entries) =>
      entries.map((entry) => {
        if (entry.id !== alertId) return entry;
        const nextCondition =
          condition === undefined ? entry.condition : (condition as TAlert["condition"]);
        return {
          ...entry,
          ...patch,
          description: patch.description === undefined ? entry.description : patch.description,
          condition: nextCondition,
          filters: toFilters(nextCondition),
          channels: channels
            ? channels.map((channel) =>
                toStoredChannel(
                  channel,
                  entry.channels.find((saved) => saved.id === channel.id)
                )
              )
            : entry.channels,
          updatedAt: new Date().toISOString()
        };
      })
    );
    return byId(alertId);
  }),
  useDeleteAlert: fixtureMutation(({ alertId }) => {
    alerts.update((entries) => entries.filter((entry) => entry.id !== alertId));
    return { id: alertId };
  }),
  useTestAlertChannel: fixtureMutation(({ channelType, config, recipients }) => {
    if (channelType === AlertChannelType.Webhook && String(config?.url ?? "").includes("invalid")) {
      return { success: false, error: "The endpoint refused the connection." };
    }
    return {
      success: true,
      deliveredTo: channelType === AlertChannelType.Email ? (recipients?.length ?? 0) : 1
    };
  }),
  useAlertApplications: ({ search, limit = 100 }) => {
    const needle = search?.trim().toLowerCase();
    const matched = applications.filter(
      (entry) => !needle || entry.name.toLowerCase().includes(needle)
    );
    return {
      data: { applications: matched.slice(0, limit), total: matched.length },
      isPending: false,
      error: null
    };
  },
  useAlertOrgUsers: () => ({ data: orgUsers, isPending: false, error: null }),
  useHasEnterpriseAlerting: () => ({ data: true, isPending: false, error: null })
};
