import { TMicrosoftTeamsMessage } from "@app/domains/platform/workflow-integrations/ce/module";

import { SecretsChatNotificationType } from "../../models/secrets-chat-event";
import { TSecretsChatNotification } from "./notification";

const card = (body: unknown[], actionUrl: string): TMicrosoftTeamsMessage => ({
  adaptiveCard: {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body,
    actions: [{ type: "Action.OpenUrl", title: "View request in Infisical", url: actionUrl }]
  }
});

const title = (text: string) => ({ type: "TextBlock", text, weight: "Bolder", size: "Large" });

const paragraph = (text: string) => ({ type: "TextBlock", text, wrap: true });

// `siteUrl` is interpolated as given: an instance without SITE_URL gets "undefined/..." links.
export const renderTeamsMessage = (
  notification: TSecretsChatNotification,
  { orgId, siteUrl }: { orgId: string; siteUrl: string | undefined }
): TMicrosoftTeamsMessage | null => {
  switch (notification.type) {
    case SecretsChatNotificationType.SecretApproval: {
      const { payload } = notification;
      const author = payload.machineIdentityId
        ? `machine identity ${payload.machineIdentityId}`
        : (payload.userEmail ?? "unknown");

      return card(
        [
          title("Secret approval request"),
          paragraph(`A secret approval request has been opened by ${author}.`),
          {
            type: "FactSet",
            facts: [
              { title: "Project", value: payload.projectName },
              { title: "Environment", value: payload.environment },
              { title: "Secret path", value: payload.secretPath || "/" },
              { title: `Secret Key${payload.secretKeys.length > 1 ? "s" : ""}`, value: payload.secretKeys.join(", ") }
            ]
          }
        ],
        `${siteUrl}/organizations/${orgId}/projects/secret-management/${payload.projectId}/approval?requestId=${payload.requestId}`
      );
    }
    case SecretsChatNotificationType.AccessRequest: {
      const { payload } = notification;

      return card(
        [
          title("New access approval request pending for review"),
          paragraph(
            `${payload.requesterFullName} (${payload.requesterEmail}) has requested ${
              payload.isTemporary ? "temporary" : "permanent"
            } access to path '${payload.secretPath}' in the ${payload.environment} environment of ${
              payload.projectName
            } project.`
          ),
          paragraph(`The following permissions are requested: ${payload.permissions.join(", ")}`),
          payload.note ? paragraph(`**User Note**: ${payload.note}`) : null
        ].filter(Boolean),
        payload.approvalUrl
      );
    }
    case SecretsChatNotificationType.AccessRequestUpdated: {
      const { payload } = notification;

      return card(
        [
          title("Updated access approval request pending for review"),
          paragraph(
            `${payload.editorFullName} (${payload.editorEmail}) has updated the ${
              payload.isTemporary ? "temporary" : "permanent"
            } access request from ${payload.requesterFullName} (${payload.requesterEmail}) to ${payload.secretPath} in the ${payload.environment} environment of ${payload.projectName}.`
          ),
          paragraph(`The following permissions are requested: ${payload.permissions.join(", ")}`),
          payload.editNote ? paragraph(`**Editor Note**: ${payload.editNote}`) : null
        ].filter(Boolean),
        payload.approvalUrl
      );
    }
    default:
      return null;
  }
};
