import {
  AlertChannelType,
  AlertPrincipalType,
  AlertResourceType,
  type TAlert,
  type TAlertChannelEmbedded,
  type TAlertChannelInput,
  WebhookAuthType
} from "@app/hooks/api/alerts/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { alertsDemo, toStoredChannel } from "../cert-manager-settings/demo-alerts";
import { createFixtureStore } from "../fixture-store";
import type { SecretsReminderChannelsAdapter } from "./contract-reminder-channels";
import { useScenario } from "./demo-store";

const PROJECT_ID = "payments-api";
const REMINDER_SECRET_ID = "payments-api:dev:/:DATABASE_URL";

const channel = (
  id: string,
  name: string,
  channelType: AlertChannelType,
  fields: Partial<TAlertChannelEmbedded> = {}
): TAlertChannelEmbedded => ({
  id: `reminder-channel-${id}`,
  name,
  channelType,
  enabled: true,
  config: {},
  recipients: [],
  ...fields
});

const reminderAlert = (
  resourceId: string,
  projectId: string,
  channels: TAlertChannelEmbedded[]
): TAlert => ({
  id: `reminder-alert-${resourceId}`,
  name: "Secret reminder",
  description: null,
  resourceType: AlertResourceType.SecretReminder,
  resourceId,
  eventType: "secret.reminder.due",
  condition: null,
  enabled: true,
  orgId: V4_DEMO_ORG_ID,
  projectId,
  resourceName: null,
  lastRun: null,
  createdAt: "2026-10-22T12:00:00Z",
  updatedAt: "2026-10-22T12:00:00Z",
  channels
});

const optimal = [
  channel("email", "Email", AlertChannelType.Email, {
    recipients: [
      {
        principalType: AlertPrincipalType.ProjectAdmins,
        principalId: PROJECT_ID
      },
      { principalType: AlertPrincipalType.User, principalId: "u-sarah" }
    ]
  }),
  channel("slack", "Slack", AlertChannelType.Slack, {
    config: { hasWebhookUrl: true }
  }),
  channel("webhook", "Webhook", AlertChannelType.Webhook, {
    config: {
      url: "https://hooks.acme.dev/infisical/reminders",
      authType: WebhookAuthType.Bearer,
      hasAuthCredentials: true,
      headers: []
    }
  })
];

const stressed = [
  channel("email", "Email", AlertChannelType.Email, {
    recipients: [
      {
        principalType: AlertPrincipalType.ProjectMembers,
        principalId: PROJECT_ID
      },
      {
        principalType: AlertPrincipalType.ProjectAdmins,
        principalId: PROJECT_ID
      },
      ...["u-sarah", "u-marcus", "u-priya", "u-diego", "u-hana"].map((principalId) => ({
        principalType: AlertPrincipalType.User,
        principalId
      })),
      {
        principalType: AlertPrincipalType.Email,
        principalId: "platform-security-oncall-rotation@payments-infrastructure.acme.dev"
      },
      {
        principalType: AlertPrincipalType.Email,
        principalId: "compliance-audit-notifications@regulatory-reporting.acme.dev"
      },
      {
        principalType: AlertPrincipalType.Group,
        principalId: "group-platform"
      },
      {
        principalType: AlertPrincipalType.Group,
        principalId: "group-security"
      }
    ]
  }),
  channel("slack", "Slack", AlertChannelType.Slack, {
    config: { hasWebhookUrl: true }
  }),
  channel("slack-2", "Slack 2", AlertChannelType.Slack, {
    enabled: false,
    config: { hasWebhookUrl: true }
  }),
  channel("webhook", "Webhook", AlertChannelType.Webhook, {
    config: {
      url: "https://events.payments-infrastructure.acme.dev/integrations/infisical/secret-rotation-reminders/v2/production-us-east-1?source=infisical&tenant=payments-platform",
      authType: WebhookAuthType.Header,
      authHeaderName: "X-Payments-Platform-Integration-Api-Key",
      hasAuthHeaderValue: true,
      hasSigningSecret: true,
      headers: [
        {
          key: "X-Infisical-Environment",
          value: "production-payments-primary-us-east-1"
        },
        {
          key: "X-Correlation-Source",
          value: "secret-rotation-reminder-pipeline-payments-database-credentials"
        },
        { key: "X-Team", value: "payments-platform-reliability" }
      ]
    }
  }),
  channel("pagerduty", "PagerDuty", AlertChannelType.PagerDuty, {
    config: { hasIntegrationKey: true }
  }),
  channel("webhook-2", "Webhook 2", AlertChannelType.Webhook, {
    config: {
      url: "https://audit.regulatory-reporting.acme.dev/webhooks/infisical",
      authType: WebhookAuthType.Basic,
      basicUsername: "infisical-reminders-service-account",
      hasBasicPassword: true,
      headers: []
    }
  })
];

const stores = {
  base: createFixtureStore([reminderAlert(REMINDER_SECRET_ID, PROJECT_ID, optimal)]),
  large: createFixtureStore([reminderAlert(REMINDER_SECRET_ID, PROJECT_ID, stressed)])
};

export const useReminderAlertStore = () => (useScenario() === "large" ? stores.large : stores.base);
type ReminderAlertStore = ReturnType<typeof useReminderAlertStore>;

export const saveReminderAlert = (
  store: ReminderAlertStore,
  secretId: string,
  projectId: string,
  channels: TAlertChannelInput[]
) =>
  store.update((alerts) => {
    const previous = alerts.find((alert) => alert.resourceId === secretId);
    const stored = channels.map((input) =>
      toStoredChannel(
        input,
        previous?.channels.find((entry) => entry.id === input.id)
      )
    );
    return [
      ...alerts.filter((alert) => alert.resourceId !== secretId),
      reminderAlert(secretId, projectId, stored)
    ];
  });

export const deleteReminderAlert = (store: ReminderAlertStore, secretId: string) =>
  store.update((alerts) => alerts.filter((alert) => alert.resourceId !== secretId));

export const secretsReminderChannelsDemo: SecretsReminderChannelsAdapter = {
  useReminderAlerts: (dto) => {
    const alerts = useReminderAlertStore().use();
    return {
      data: alerts.filter(
        (alert) => alert.resourceType === dto.resourceType && alert.resourceId === dto.resourceId
      ),
      isPending: false,
      error: null
    };
  },
  useReminderMembers: alertsDemo.useAlertOrgUsers
};
