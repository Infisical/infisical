import { INTERNAL_KMS_KEY_ID, type KmsListEntry, KmsType } from "@app/hooks/api/kms/types";
import { type TWebhook, WebhookEvent, WebhookType } from "@app/hooks/api/webhooks/types";
import {
  type MicrosoftTeamsIntegration,
  type MicrosoftTeamsIntegrationTeam,
  type ProjectWorkflowIntegrationConfig,
  type SlackIntegrationChannel,
  type WorkflowIntegration,
  WorkflowIntegrationPlatform,
  WorkflowIntegrationStatus
} from "@app/hooks/api/workflowIntegrations/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { ProjectIntegrationsAdapter } from "./contract";

const day = (value: string) => new Date(`${value}T09:30:00Z`).toISOString();

const externalKms: KmsListEntry[] = [
  {
    id: "kms-aws-prod",
    name: "aws-prod-us-east-1",
    description: "Customer managed key in the production AWS account",
    isDisabled: false,
    createdAt: day("2026-03-02"),
    updatedAt: day("2026-03-02"),
    externalKms: { provider: "aws", status: "active", statusDetails: "" }
  },
  {
    id: "kms-gcp-eu",
    name: "gcp-europe-west1",
    description: "Cloud KMS key ring for EU data residency",
    isDisabled: false,
    createdAt: day("2026-05-18"),
    updatedAt: day("2026-05-18"),
    externalKms: { provider: "gcp", status: "active", statusDetails: "" }
  }
];

const environmentOf = (projectId: string, slug: string) => {
  const names: Record<string, string> = {
    dev: "Development",
    staging: "Staging",
    prod: "Production"
  };
  return { id: `${projectId}-${slug}`, slug, name: names[slug] ?? slug };
};

const webhook = (
  projectId: string,
  id: string,
  slug: string,
  patch: Partial<TWebhook> & Pick<TWebhook, "url" | "type">
): TWebhook => ({
  id,
  projectId,
  environment: environmentOf(projectId, slug),
  envId: `${projectId}-${slug}`,
  secretPath: "/",
  lastStatus: "success",
  isDisabled: false,
  eventsFilter: [],
  createdAt: day("2026-06-04"),
  updatedAt: day("2026-11-07"),
  ...patch
});

const slackChannels: Record<string, SlackIntegrationChannel[]> = {
  "wf-slack-acme": [
    { id: "C04SEC0PS", name: "security-ops" },
    { id: "C05PLATFORM", name: "platform-approvals" },
    { id: "C06PAYMENTS", name: "payments-oncall" },
    { id: "C07ALERTS", name: "infra-alerts" },
    { id: "C08GENERAL", name: "general" }
  ],
  "wf-slack-contractors": [
    { id: "C11VENDORS", name: "vendor-access" },
    { id: "C12REVIEWS", name: "access-reviews" }
  ]
};

const teamsTeams: Record<string, MicrosoftTeamsIntegrationTeam[]> = {
  "wf-teams-acme": [
    {
      teamId: "team-platform",
      teamName: "Platform engineering",
      channels: [
        { channelId: "19:platform-general", channelName: "General" },
        { channelId: "19:platform-approvals", channelName: "Approvals" }
      ]
    },
    {
      teamId: "team-security",
      teamName: "Security",
      channels: [
        { channelId: "19:security-general", channelName: "General" },
        { channelId: "19:security-access", channelName: "Access requests" },
        { channelId: "19:security-incidents", channelName: "Incidents" }
      ]
    }
  ]
};

const workflowIntegrations: WorkflowIntegration[] = [
  {
    id: "wf-slack-acme",
    slug: "acme-slack",
    description: "Main Acme Slack workspace",
    status: WorkflowIntegrationStatus.Installed,
    integration: WorkflowIntegrationPlatform.SLACK
  },
  {
    id: "wf-slack-contractors",
    slug: "acme-contractors-slack",
    description: "Shared workspace with contractors",
    status: WorkflowIntegrationStatus.Installed,
    integration: WorkflowIntegrationPlatform.SLACK
  },
  {
    id: "wf-teams-acme",
    slug: "acme-teams",
    description: "Acme Microsoft 365 tenant",
    status: WorkflowIntegrationStatus.Installed,
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  }
];

const microsoftTeamsIntegrations: MicrosoftTeamsIntegration[] = [
  {
    id: "wf-teams-acme",
    slug: "acme-teams",
    description: "Acme Microsoft 365 tenant",
    tenantId: "4f1c7a52-8d2e-4b9a-a3c1-6e0f2d7b9a14"
  }
];

type ProjectConfig = ProjectWorkflowIntegrationConfig & { projectId: string };

type State = {
  kms: Record<string, string>;
  webhooks: TWebhook[];
  configs: ProjectConfig[];
};

const store = createFixtureStore<State>({
  kms: {},
  webhooks: [
    webhook("payments-api", "wh-1d8c2f", "prod", {
      type: WebhookType.GENERAL,
      url: "https://deploy.acme-payments.example.com/hooks/infisical",
      updatedAt: day("2026-11-09")
    }),
    webhook("payments-api", "wh-4a91be", "staging", {
      type: WebhookType.SLACK,
      url: "https://hooks.slack.com/services/T024BE7LD/B05Q2N8KX1R/q7Zp4mWc0dLx",
      secretPath: "/billing",
      lastStatus: "failed",
      lastRunErrorMessage: "Request failed with status code 404: no_service",
      eventsFilter: [
        { eventName: WebhookEvent.SecretModified },
        { eventName: WebhookEvent.SecretRotationFailed }
      ]
    }),
    webhook("payments-api", "wh-7e03d5", "dev", {
      type: WebhookType.MICROSOFT_TEAMS,
      url: "https://acmepayments.webhook.office.com/webhookb2/3f9a1c2e-77b4-4d0e/IncomingWebhook/8c1d",
      secretPath: "/payments/stripe",
      isDisabled: true,
      eventsFilter: [{ eventName: WebhookEvent.AccessRequestModified }]
    })
  ],
  configs: [
    {
      projectId: "payments-api",
      id: "cfg-slack-payments",
      integration: WorkflowIntegrationPlatform.SLACK,
      integrationId: "wf-slack-acme",
      isAccessRequestNotificationEnabled: true,
      accessRequestChannels: "C04SEC0PS, C06PAYMENTS",
      isSecretRequestNotificationEnabled: true,
      secretRequestChannels: "C05PLATFORM",
      isSecretSyncErrorNotificationEnabled: false,
      secretSyncErrorChannels: ""
    }
  ]
});

const loaded = <T>(data: T) => ({ data, isPending: false, error: null });

const setKms = (projectId: string, kmsKeyId: string) =>
  store.update((state) => ({ ...state, kms: { ...state.kms, [projectId]: kmsKeyId } }));

const patchWebhook = (webhookId: string, patch: Partial<TWebhook>) =>
  store.update((state) => ({
    ...state,
    webhooks: state.webhooks.map((entry) =>
      entry.id === webhookId ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry
    )
  }));

export const projectIntegrationsDemo: ProjectIntegrationsAdapter = {
  useExternalKmsList: () => loaded(externalKms),
  useActiveProjectKms: (projectId) => {
    const kmsKeyId = store.use().kms[projectId] ?? INTERNAL_KMS_KEY_ID;
    const kms = externalKms.find((entry) => entry.id === kmsKeyId);
    return loaded(
      kms
        ? { id: kms.id, name: kms.name, isExternal: "true" }
        : { id: `${projectId}-internal-kms`, name: "Default Infisical KMS", isExternal: "" }
    );
  },
  useUpdateProjectKms: (projectId) =>
    fixtureMutation(
      (update: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string }) =>
        setKms(projectId, update.type === KmsType.External ? update.kmsId : INTERNAL_KMS_KEY_ID)
    )(),
  useLoadProjectKmsBackup: (projectId) =>
    fixtureMutation(() => setKms(projectId, INTERNAL_KMS_KEY_ID))(),
  fetchProjectKmsBackup: async (projectId) => {
    const kmsKeyId = store.get().kms[projectId] ?? INTERNAL_KMS_KEY_ID;
    return { secretManager: `v1.${projectId}.${kmsKeyId}.ZGVtby1rbXMtYmFja3Vw` };
  },
  useWebhooks: (projectId) =>
    loaded(store.use().webhooks.filter((entry) => entry.projectId === projectId)),
  useCreateWebhook: fixtureMutation((dto) => {
    const id = `wh-${Math.random().toString(16).slice(2, 8)}`;
    store.update((state) => ({
      ...state,
      webhooks: [
        ...state.webhooks,
        webhook(dto.projectId, id, dto.environment, {
          type: dto.type,
          url: dto.webhookUrl,
          secretPath: dto.secretPath || "/",
          lastStatus: undefined as unknown as TWebhook["lastStatus"],
          eventsFilter: dto.eventsFilter ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      ]
    }));
    return { id };
  }),
  useUpdateWebhook: fixtureMutation(({ webhookId, isDisabled, eventsFilter }) => {
    patchWebhook(webhookId, {
      ...(isDisabled === undefined ? {} : { isDisabled }),
      ...(eventsFilter === undefined ? {} : { eventsFilter })
    });
    return {};
  }),
  useDeleteWebhook: fixtureMutation(({ webhookId }) => {
    store.update((state) => ({
      ...state,
      webhooks: state.webhooks.filter((entry) => entry.id !== webhookId)
    }));
    return {};
  }),
  useTestWebhook: fixtureMutation(({ webhookId }) => {
    patchWebhook(webhookId, { lastStatus: "success", lastRunErrorMessage: undefined });
    return {};
  }),
  useWorkflowIntegrationConfig: ({ projectId, integration }) => {
    const config = store
      .use()
      .configs.find((entry) => entry.projectId === projectId && entry.integration === integration);
    if (!config) return loaded(null);
    const { projectId: _projectId, ...rest } = config;
    return loaded(rest as ProjectWorkflowIntegrationConfig);
  },
  useUpdateWorkflowIntegrationConfig: fixtureMutation((dto) => {
    store.update((state) => {
      const others = state.configs.filter(
        (entry) => !(entry.projectId === dto.projectId && entry.integration === dto.integration)
      );
      const next: ProjectConfig =
        dto.integration === WorkflowIntegrationPlatform.SLACK
          ? { ...dto, id: `cfg-slack-${dto.projectId}` }
          : {
              ...dto,
              id: `cfg-teams-${dto.projectId}`,
              accessRequestChannels: dto.accessRequestChannels ?? { teamId: "", channelIds: [] },
              secretRequestChannels: dto.secretRequestChannels ?? { teamId: "", channelIds: [] }
            };
      return { ...state, configs: [...others, next] };
    });
    return {};
  }),
  useDeleteWorkflowIntegration: fixtureMutation(({ projectId, integration }) => {
    store.update((state) => ({
      ...state,
      configs: state.configs.filter(
        (entry) => !(entry.projectId === projectId && entry.integration === integration)
      )
    }));
    return {};
  }),
  useWorkflowIntegrations: () => loaded(workflowIntegrations),
  useMicrosoftTeamsIntegrations: () => loaded(microsoftTeamsIntegrations),
  useSlackChannels: (integrationId) =>
    loaded(integrationId ? (slackChannels[integrationId] ?? []) : []),
  useMicrosoftTeamsTeams: (integrationId) =>
    loaded(integrationId ? (teamsTeams[integrationId] ?? []) : [])
};
