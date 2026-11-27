import { SecretsChatNotificationType } from "../../models/secrets-chat-event";
import { TSecretsChatNotification } from "./notification";
import { renderSlackMessage } from "./slack-message";

const SITE = "https://app.infisical.test";

const header = (text: string) => [{ type: "header", text: { type: "plain_text", text, emoji: true } }];

const viewButton = (text: string, url: string) => ({
  type: "actions",
  elements: [{ type: "button", text: { type: "plain_text", text, emoji: true }, style: "primary", url }]
});

describe("renderSlackMessage", () => {
  test("should render a secret approval request with the author, the secret keys and a link to the request", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.SecretApproval,
      payload: {
        userEmail: "ada@example.com",
        environment: "prod",
        secretPath: "/app",
        requestId: "req-1",
        projectId: "proj-1",
        projectName: "Payments",
        secretKeys: ["DB_URL", "API_KEY"],
        approvalUrl: `${SITE}/approval/req-1`
      }
    };

    // Action
    const message = renderSlackMessage(notification, SITE);

    // Assert
    const body = `A secret approval request has been opened by ada@example.com.
*Project*: Payments
*Environment*: prod
*Secret path*: /app
*Secret Keys*: DB_URL, API_KEY`;
    expect(message).toEqual({
      text: body,
      blocks: header("Secret approval request"),
      attachments: [
        {
          color: "#e0ed34",
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: body } },
            viewButton("View request", `${SITE}/approval/req-1`)
          ]
        }
      ]
    });
  });

  test("should name a machine identity as the author, use the root path and a singular key label", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.SecretApproval,
      payload: {
        machineIdentityId: "ident-1",
        userEmail: "ignored@example.com",
        environment: "dev",
        secretPath: "",
        requestId: "req-2",
        projectId: "proj-1",
        projectName: "Payments",
        secretKeys: ["ONLY"],
        approvalUrl: "https://example.test/a"
      }
    };

    // Action
    const message = renderSlackMessage(notification, SITE);

    // Assert
    expect(message.text).toBe(`A secret approval request has been opened by machine identity ident-1.
*Project*: Payments
*Environment*: dev
*Secret path*: /
*Secret Key*: ONLY`);
  });

  test("should say unknown when a secret approval request has no author", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.SecretApproval,
      payload: {
        environment: "dev",
        secretPath: "/",
        requestId: "r",
        projectId: "p",
        projectName: "P",
        secretKeys: ["K"],
        approvalUrl: "u"
      }
    };

    // Action
    const message = renderSlackMessage(notification, SITE);

    // Assert
    expect(message.text).toContain("opened by unknown.");
  });

  test("should render an access request with a project link, the permissions and the note", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.AccessRequest,
      payload: {
        requesterFullName: "Ada Lovelace",
        requesterEmail: "ada@example.com",
        isTemporary: true,
        secretPath: "/app",
        environment: "prod",
        projectName: "Payments",
        projectPath: "/organizations/o1/projects/secret-management/p1",
        permissions: ["readValue", "edit"],
        approvalUrl: "https://example.test/approve",
        note: "Need it for the release"
      }
    };

    // Action
    const message = renderSlackMessage(notification, SITE);

    // Assert
    const projectUrl = `${SITE}/organizations/o1/projects/secret-management/p1/overview`;
    expect(message).toEqual({
      text: "Ada Lovelace (ada@example.com) has requested temporary access to /app in the prod environment of Payments.\n\nThe following permissions are requested: readValue, edit\n\nUser note: Need it for the release",
      blocks: header("New access approval request pending for review"),
      attachments: [
        {
          color: "#e0ed34",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Ada Lovelace* (ada@example.com) has requested *temporary* access to */app* in the *prod* environment of *<${projectUrl}|Payments>*.\n\nThe following permissions are requested: *readValue*, *edit*\n\n*User note:* Need it for the release`
              }
            },
            viewButton("View request", "https://example.test/approve")
          ]
        }
      ]
    });
  });

  test("should render a permanent access request without a note", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.AccessRequest,
      payload: {
        requesterFullName: "Ada Lovelace",
        requesterEmail: "ada@example.com",
        isTemporary: false,
        secretPath: "/",
        environment: "dev",
        projectName: "Payments",
        projectPath: "/p",
        permissions: ["read"],
        approvalUrl: "u"
      }
    };

    // Action
    const message = renderSlackMessage(notification, SITE);

    // Assert
    expect(message.text).toBe(
      "Ada Lovelace (ada@example.com) has requested permanent access to / in the dev environment of Payments.\n\nThe following permissions are requested: read"
    );
  });

  test("should render an updated access request with the editor and the editor note", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.AccessRequestUpdated,
      payload: {
        requesterFullName: "Ada Lovelace",
        requesterEmail: "ada@example.com",
        editorFullName: "Grace Hopper",
        editorEmail: "grace@example.com",
        isTemporary: false,
        secretPath: "/app",
        environment: "prod",
        projectName: "Payments",
        projectPath: "/p",
        permissions: ["read", "edit"],
        approvalUrl: "https://example.test/approve",
        editNote: "Narrowed it down"
      }
    };

    // Action
    const message = renderSlackMessage(notification, SITE);

    // Assert
    expect(message).toEqual({
      text: "Grace Hopper (grace@example.com) has updated the permanent access request from Ada Lovelace (ada@example.com) to /app in the prod environment of Payments.\n\nThe following permissions are requested: read, edit\n\nEditor Note: Narrowed it down",
      blocks: header("Updated access approval request pending for review"),
      attachments: [
        {
          color: "#e0ed34",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Grace Hopper* (grace@example.com) has updated the *permanent* access request from *Ada Lovelace* (ada@example.com) to */app* in the *prod* environment of *<${SITE}/p/overview|Payments>*.\n\nThe following permissions are requested: *read*, *edit*\n\n*Editor Note:* Narrowed it down`
              }
            },
            viewButton("View request", "https://example.test/approve")
          ]
        }
      ]
    });
  });

  test("should render a secret sync error in the error color with a link to the sync", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.SecretSyncError,
      payload: {
        syncName: "prod-sync",
        syncActionLabel: "Sync",
        syncDestination: "AWS Secrets Manager",
        failureMessage: "Access denied",
        syncUrl: "https://example.test/sync/1",
        environment: "prod",
        secretPath: "/app",
        projectName: "Payments",
        projectPath: "/organizations/o1/projects/secret-management/p1/overview"
      }
    };

    // Action
    const message = renderSlackMessage(notification, SITE);

    // Assert
    const projectUrl = `${SITE}/organizations/o1/projects/secret-management/p1/overview`;
    expect(message).toEqual({
      text: `Secret sync prod-sync for AWS Secrets Manager failed on Sync\n\n\nEnvironment: prod\n\n\nSecret Path: /app\n\n\nProject: Payments (${projectUrl})\n\n\nReason:\nAccess denied`,
      blocks: header("Secret sync prod-sync for AWS Secrets Manager failed on Sync"),
      attachments: [
        {
          color: "#e74c3c",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Environment:* prod\n\n*Secret Path:* /app\n\n*Project:* <${projectUrl}|Payments>\n\n*Reason:* Access denied`
              }
            },
            viewButton("Open secret sync", "https://example.test/sync/1")
          ]
        }
      ]
    });
  });
});
