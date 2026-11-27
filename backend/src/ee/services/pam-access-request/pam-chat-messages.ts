import { ChatMessage } from "@app/domains/platform/workflow-integrations/ce/module";

const COMPANY_BRAND_COLOR = "#e0ed34";
const ERROR_COLOR = "#e74c3c";

export enum PamChatEvent {
  AccessRequested = "pam-access-requested",
  AccessRequestApproved = "pam-access-request-approved",
  AccessRequestDenied = "pam-access-request-denied",
  AccessRequestBypassed = "pam-access-request-bypassed"
}

export type TPamChatNotification =
  | {
      type: PamChatEvent.AccessRequested;
      payload: {
        requesterFullName: string;
        requesterEmail: string;
        accountName: string;
        folderName: string;
        accessDuration: string;
        accessTypeLabel?: string;
        reason?: string;
        approvalUrl: string;
      };
    }
  | {
      type: PamChatEvent.AccessRequestApproved | PamChatEvent.AccessRequestDenied;
      payload: {
        requesterFullName: string;
        requesterEmail: string;
        accountName: string;
        folderName: string;
        comment?: string;
        autoApprovalRuleName?: string;
        approvalUrl: string;
      };
    }
  | {
      type: PamChatEvent.AccessRequestBypassed;
      payload: {
        requesterFullName: string;
        requesterEmail: string;
        accountName: string;
        folderName: string;
        accessDuration: string;
        bypassReason: string;
      };
    };

// Escapes Slack control sequences in user-supplied text so a requester can't inject
// mentions (<!channel>) or disguised links (<url|label>) into notification channels
const escapeSlackMrkdwn = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const headerBlocks = (title: string) => [{ type: "header", text: { type: "plain_text", text: title, emoji: true } }];

const viewButton = (label: string, url: string) => ({
  type: "actions",
  elements: [{ type: "button", text: { type: "plain_text", text: label, emoji: true }, style: "primary", url }]
});

const slackMessage = ({
  title,
  text,
  blocks,
  color
}: {
  title: string;
  text: string;
  blocks: unknown[];
  color: string;
}) =>
  ChatMessage.slack({
    text,
    blocks: headerBlocks(title),
    attachments: [{ color, blocks }]
  });

export const buildPamSlackMessage = (notification: TPamChatNotification): ChatMessage => {
  switch (notification.type) {
    case PamChatEvent.AccessRequested: {
      const { payload } = notification;
      const requesterFullName = escapeSlackMrkdwn(payload.requesterFullName);
      const requesterEmail = escapeSlackMrkdwn(payload.requesterEmail);
      const accountName = escapeSlackMrkdwn(payload.accountName);
      const folderName = escapeSlackMrkdwn(payload.folderName);
      const reason = payload.reason ? escapeSlackMrkdwn(payload.reason) : undefined;
      const accessTypeLabel = escapeSlackMrkdwn(payload.accessTypeLabel ?? "access");

      return slackMessage({
        title: "New PAM access request pending review",
        text: `${requesterFullName} (${requesterEmail}) has requested ${accessTypeLabel} to ${accountName} in the ${folderName} folder.\n\nDuration: ${payload.accessDuration}${
          reason ? `\n\nReason: ${reason}` : ""
        }`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${requesterFullName}* (${requesterEmail}) has requested ${accessTypeLabel} to *${accountName}* in the *${folderName}* folder.\n\n*Duration:* ${payload.accessDuration}${
                reason ? `\n\n*Reason:* ${reason}` : ""
              }`
            }
          },
          viewButton("View request", payload.approvalUrl)
        ],
        color: COMPANY_BRAND_COLOR
      });
    }
    case PamChatEvent.AccessRequestApproved:
    case PamChatEvent.AccessRequestDenied: {
      const { payload } = notification;
      const isApproved = notification.type === PamChatEvent.AccessRequestApproved;
      const decision = isApproved ? "approved" : "denied";
      const requesterFullName = escapeSlackMrkdwn(payload.requesterFullName);
      const requesterEmail = escapeSlackMrkdwn(payload.requesterEmail);
      const accountName = escapeSlackMrkdwn(payload.accountName);
      const folderName = escapeSlackMrkdwn(payload.folderName);
      const comment = payload.comment ? escapeSlackMrkdwn(payload.comment) : undefined;
      const autoApprovalRuleName = payload.autoApprovalRuleName
        ? escapeSlackMrkdwn(payload.autoApprovalRuleName)
        : undefined;

      let detail = "";
      if (autoApprovalRuleName)
        detail = `\n\nApproved automatically by the auto-approval rule "${autoApprovalRuleName}".`;
      else if (comment) detail = `\n\nReviewer comment: ${comment}`;

      return slackMessage({
        title: `PAM access request ${decision}`,
        text: `The access request from ${requesterFullName} (${requesterEmail}) for ${accountName} in the ${folderName} folder has been ${decision}.${detail}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `The access request from *${requesterFullName}* (${requesterEmail}) for *${accountName}* in the *${folderName}* folder has been *${decision}*.${
                comment ? `\n\n*Reviewer comment:* ${comment}` : ""
              }`
            }
          },
          viewButton("View access", payload.approvalUrl)
        ],
        color: isApproved ? COMPANY_BRAND_COLOR : ERROR_COLOR
      });
    }
    case PamChatEvent.AccessRequestBypassed: {
      const { payload } = notification;
      const requesterFullName = escapeSlackMrkdwn(payload.requesterFullName);
      const requesterEmail = escapeSlackMrkdwn(payload.requesterEmail);
      const accountName = escapeSlackMrkdwn(payload.accountName);
      const folderName = escapeSlackMrkdwn(payload.folderName);
      const bypassReason = escapeSlackMrkdwn(payload.bypassReason);

      return slackMessage({
        title: "PAM access approval bypassed",
        text: `${requesterFullName} (${requesterEmail}) used break-glass to self-approve access to ${accountName} in the ${folderName} folder, skipping the approvers.\n\nDuration: ${payload.accessDuration}\n\nReason: ${bypassReason}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${requesterFullName}* (${requesterEmail}) used break-glass to self-approve access to *${accountName}* in the *${folderName}* folder, skipping the approvers.\n\n*Duration:* ${payload.accessDuration}\n\n*Reason:* ${bypassReason}`
            }
          }
        ],
        color: ERROR_COLOR
      });
    }
    default:
      throw new Error("Unsupported PAM chat notification type");
  }
};
