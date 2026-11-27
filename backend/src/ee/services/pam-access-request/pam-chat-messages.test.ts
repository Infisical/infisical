import { buildPamSlackMessage, PamChatEvent } from "./pam-chat-messages";

const BRAND = "#e0ed34";
const ERROR = "#e74c3c";

const base = {
  requesterFullName: "Jane <!channel>",
  requesterEmail: "jane@example.com",
  accountName: "prod-db",
  folderName: "Production & Co",
  approvalUrl: "https://app.example.com/organizations/org/pam/approval-requests?requestId=r1"
};

const slack = (event: Parameters<typeof buildPamSlackMessage>[0]) => buildPamSlackMessage(event).toJSON();

const button = (label: string) => ({
  type: "actions",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: label, emoji: true },
      style: "primary",
      url: base.approvalUrl
    }
  ]
});

const header = (text: string) => [{ type: "header", text: { type: "plain_text", text, emoji: true } }];

describe("buildPamSlackMessage", () => {
  test("renders a pending request with the duration, reason and a link to review it", () => {
    const message = slack({
      type: PamChatEvent.AccessRequested,
      payload: { ...base, accessDuration: "1h", accessTypeLabel: "credential access", reason: "fix <b>" }
    });

    expect(message).toEqual({
      provider: "slack",
      slack: {
        text: "Jane &lt;!channel&gt; (jane@example.com) has requested credential access to prod-db in the Production &amp; Co folder.\n\nDuration: 1h\n\nReason: fix &lt;b&gt;",
        blocks: header("New PAM access request pending review"),
        attachments: [
          {
            color: BRAND,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "*Jane &lt;!channel&gt;* (jane@example.com) has requested credential access to *prod-db* in the *Production &amp; Co* folder.\n\n*Duration:* 1h\n\n*Reason:* fix &lt;b&gt;"
                }
              },
              button("View request")
            ]
          }
        ]
      }
    });
  });

  test("defaults the access label and leaves out an absent reason", () => {
    const message = slack({
      type: PamChatEvent.AccessRequested,
      payload: { ...base, accessDuration: "30m" }
    });

    expect(message).toMatchObject({
      slack: {
        text: "Jane &lt;!channel&gt; (jane@example.com) has requested access to prod-db in the Production &amp; Co folder.\n\nDuration: 30m"
      }
    });
  });

  test("renders an approval with the reviewer comment", () => {
    const message = slack({
      type: PamChatEvent.AccessRequestApproved,
      payload: { ...base, comment: "ok <go>" }
    });

    expect(message).toEqual({
      provider: "slack",
      slack: {
        text: "The access request from Jane &lt;!channel&gt; (jane@example.com) for prod-db in the Production &amp; Co folder has been approved.\n\nReviewer comment: ok &lt;go&gt;",
        blocks: header("PAM access request approved"),
        attachments: [
          {
            color: BRAND,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "The access request from *Jane &lt;!channel&gt;* (jane@example.com) for *prod-db* in the *Production &amp; Co* folder has been *approved*.\n\n*Reviewer comment:* ok &lt;go&gt;"
                }
              },
              button("View access")
            ]
          }
        ]
      }
    });
  });

  test("names the auto-approval rule in the fallback text only", () => {
    const message = slack({
      type: PamChatEvent.AccessRequestApproved,
      payload: { ...base, autoApprovalRuleName: "trusted <team>" }
    });

    expect(message).toMatchObject({
      slack: {
        text: 'The access request from Jane &lt;!channel&gt; (jane@example.com) for prod-db in the Production &amp; Co folder has been approved.\n\nApproved automatically by the auto-approval rule "trusted &lt;team&gt;".',
        attachments: [
          {
            blocks: [
              {
                text: {
                  text: "The access request from *Jane &lt;!channel&gt;* (jane@example.com) for *prod-db* in the *Production &amp; Co* folder has been *approved*."
                }
              },
              {}
            ]
          }
        ]
      }
    });
  });

  test("renders a denial in the error color", () => {
    const message = slack({ type: PamChatEvent.AccessRequestDenied, payload: base });

    expect(message).toMatchObject({
      slack: {
        text: "The access request from Jane &lt;!channel&gt; (jane@example.com) for prod-db in the Production &amp; Co folder has been denied.",
        blocks: header("PAM access request denied"),
        attachments: [{ color: ERROR }]
      }
    });
  });

  test("renders a break-glass bypass without a button", () => {
    const message = slack({
      type: PamChatEvent.AccessRequestBypassed,
      payload: {
        requesterFullName: base.requesterFullName,
        requesterEmail: base.requesterEmail,
        accountName: base.accountName,
        folderName: base.folderName,
        accessDuration: "2h",
        bypassReason: "outage <now>"
      }
    });

    expect(message).toEqual({
      provider: "slack",
      slack: {
        text: "Jane &lt;!channel&gt; (jane@example.com) used break-glass to self-approve access to prod-db in the Production &amp; Co folder, skipping the approvers.\n\nDuration: 2h\n\nReason: outage &lt;now&gt;",
        blocks: header("PAM access approval bypassed"),
        attachments: [
          {
            color: ERROR,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "*Jane &lt;!channel&gt;* (jane@example.com) used break-glass to self-approve access to *prod-db* in the *Production &amp; Co* folder, skipping the approvers.\n\n*Duration:* 2h\n\n*Reason:* outage &lt;now&gt;"
                }
              }
            ]
          }
        ]
      }
    });
  });
});
