import crypto from "node:crypto";

import { getConfig } from "@app/lib/config/env";

import { TAlertPayload } from "./alert-channel-types";

const TEST_ALERT_NAME = "Sample alert";

const TEST_ITEMS = [
  {
    id: "sample",
    title: "Sample item",
    fields: [{ label: "Detail", value: "Sample value" }]
  }
];

export const buildTestAlertPayload = ({
  orgId,
  projectId,
  alertId = crypto.randomUUID(),
  resourceId,
  getWebhookSource
}: {
  orgId: string;
  projectId?: string | null;
  alertId?: string;
  resourceId?: string | null;
  getWebhookSource?: (input: { alertId: string; resourceId?: string | null }) => string | undefined;
}): TAlertPayload => {
  const appCfg = getConfig();
  const webhookSource = getWebhookSource?.({ alertId, resourceId });

  return {
    alert: {
      id: alertId,
      name: TEST_ALERT_NAME,
      orgId,
      ...(projectId ? { projectId } : {}),
      resourceType: "alert.channel.test",
      ...(webhookSource && resourceId ? { resourceId } : {}),
      viewUrl: appCfg.SITE_URL ?? ""
    },
    ...(webhookSource ? { webhookSource } : {}),
    eventKey: "alert.channel.test",
    eventLabel: "Test",
    webhookType: "com.infisical.alert.channel.test",
    resourceKind: "Channel",
    resourceOwnerKind: "resource",
    severity: "info",
    summary: "This is a test notification from Infisical, showing how a real alert will look",
    items: TEST_ITEMS
  };
};
