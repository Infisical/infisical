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
  projectId
}: {
  orgId: string;
  projectId?: string | null;
}): TAlertPayload => {
  const appCfg = getConfig();

  return {
    alert: {
      id: crypto.randomUUID(),
      name: TEST_ALERT_NAME,
      orgId,
      ...(projectId ? { projectId } : {}),
      resourceType: "alert.channel.test",
      viewUrl: appCfg.SITE_URL ?? ""
    },
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
