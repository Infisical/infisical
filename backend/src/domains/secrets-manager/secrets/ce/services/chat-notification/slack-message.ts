import { TSlackMessage } from "@app/domains/platform/workflow-integrations/ce/module";

import { SecretsChatNotificationType } from "../../models/secrets-chat-event";
import { TSecretsChatNotification } from "./notification";

const BRAND_COLOR = "#e0ed34";
const ERROR_COLOR = "#e74c3c";

const headerBlocks = (text: string) => [{ type: "header", text: { type: "plain_text", text, emoji: true } }];

const viewButton = (label: string, url: string) => ({
  type: "actions",
  elements: [{ type: "button", text: { type: "plain_text", text: label, emoji: true }, style: "primary", url }]
});

const section = (text: string) => ({ type: "section", text: { type: "mrkdwn", text } });

// The message every channel gets: the plain text for clients without blocks, the header, and the colored body.
const layout = (input: { text: string; header: string; body: unknown[]; color: string }): TSlackMessage => ({
  text: input.text,
  blocks: headerBlocks(input.header),
  attachments: [{ color: input.color, blocks: input.body }]
});

// `siteUrl` is interpolated as given, so an unset site URL reads "undefined/..." as it always has.
export const renderSlackMessage = (
  notification: TSecretsChatNotification,
  siteUrl: string | undefined
): TSlackMessage => {
  switch (notification.type) {
    case SecretsChatNotificationType.SecretApproval: {
      const { payload } = notification;
      const author = payload.machineIdentityId
        ? `machine identity ${payload.machineIdentityId}`
        : (payload.userEmail ?? "unknown");
      const messageBody = `A secret approval request has been opened by ${author}.
*Project*: ${payload.projectName}
*Environment*: ${payload.environment}
*Secret path*: ${payload.secretPath || "/"}
*Secret Key${payload.secretKeys.length > 1 ? "s" : ""}*: ${payload.secretKeys.join(", ")}`;

      return layout({
        text: messageBody,
        header: "Secret approval request",
        body: [section(messageBody), viewButton("View request", payload.approvalUrl)],
        color: BRAND_COLOR
      });
    }
    case SecretsChatNotificationType.AccessRequest: {
      const { payload } = notification;
      const projectUrl = `${siteUrl}${payload.projectPath}/overview`;
      const accessType = payload.isTemporary ? "temporary" : "permanent";
      const permissionsFormatted = payload.permissions.map((p) => `*${p}*`).join(", ");

      const messageBody = `${payload.requesterFullName} (${payload.requesterEmail}) has requested ${accessType} access to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.\n\nThe following permissions are requested: ${payload.permissions.join(", ")}${
        payload.note ? `\n\nUser note: ${payload.note}` : ""
      }`;

      return layout({
        text: messageBody,
        header: "New access approval request pending for review",
        body: [
          section(
            `*${payload.requesterFullName}* (${payload.requesterEmail}) has requested *${accessType}* access to *${payload.secretPath}* in the *${payload.environment}* environment of *<${projectUrl}|${payload.projectName}>*.\n\nThe following permissions are requested: ${permissionsFormatted}${
              payload.note ? `\n\n*User note:* ${payload.note}` : ""
            }`
          ),
          viewButton("View request", payload.approvalUrl)
        ],
        color: BRAND_COLOR
      });
    }
    case SecretsChatNotificationType.AccessRequestUpdated: {
      const { payload } = notification;
      const projectUrl = `${siteUrl}${payload.projectPath}/overview`;
      const accessType = payload.isTemporary ? "temporary" : "permanent";
      const permissionsFormatted = payload.permissions.map((p) => `*${p}*`).join(", ");

      const messageBody = `${payload.editorFullName} (${payload.editorEmail}) has updated the ${accessType} access request from ${payload.requesterFullName} (${payload.requesterEmail}) to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.\n\nThe following permissions are requested: ${payload.permissions.join(", ")}${
        payload.editNote ? `\n\nEditor Note: ${payload.editNote}` : ""
      }`;

      return layout({
        text: messageBody,
        header: "Updated access approval request pending for review",
        body: [
          section(
            `*${payload.editorFullName}* (${payload.editorEmail}) has updated the *${accessType}* access request from *${payload.requesterFullName}* (${payload.requesterEmail}) to *${payload.secretPath}* in the *${payload.environment}* environment of *<${projectUrl}|${payload.projectName}>*.\n\nThe following permissions are requested: ${permissionsFormatted}${
              payload.editNote ? `\n\n*Editor Note:* ${payload.editNote}` : ""
            }`
          ),
          viewButton("View request", payload.approvalUrl)
        ],
        color: BRAND_COLOR
      });
    }
    default: {
      const { payload } = notification;
      const projectUrl = `${siteUrl}${payload.projectPath}`;
      const messageBody = `Secret sync ${payload.syncName} for ${payload.syncDestination} failed on ${payload.syncActionLabel}\n\n\nEnvironment: ${payload.environment}\n\n\nSecret Path: ${payload.secretPath}\n\n\nProject: ${payload.projectName} (${projectUrl})\n\n\nReason:\n${payload.failureMessage}`;

      return layout({
        text: messageBody,
        header: `Secret sync ${payload.syncName} for ${payload.syncDestination} failed on ${payload.syncActionLabel}`,
        body: [
          section(
            `*Environment:* ${payload.environment}\n\n*Secret Path:* ${payload.secretPath}\n\n*Project:* <${projectUrl}|${payload.projectName}>\n\n*Reason:* ${payload.failureMessage}`
          ),
          viewButton("Open secret sync", payload.syncUrl)
        ],
        color: ERROR_COLOR
      });
    }
  }
};
