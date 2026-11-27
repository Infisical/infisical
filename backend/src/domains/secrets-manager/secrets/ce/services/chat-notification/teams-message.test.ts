import { SecretsChatNotificationType } from "../../models/secrets-chat-event";
import { TSecretsChatNotification } from "./notification";
import { renderTeamsMessage } from "./teams-message";

const SITE = "https://app.infisical.test";
const SCHEMA = "http://adaptivecards.io/schemas/adaptive-card.json";

const title = (text: string) => ({ type: "TextBlock", text, weight: "Bolder", size: "Large" });
const paragraph = (text: string) => ({ type: "TextBlock", text, wrap: true });

describe("renderTeamsMessage", () => {
  test("should render a secret approval request as a card with a fact set and a link built from the site and org", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.SecretApproval,
      payload: {
        machineIdentityId: "ident-1",
        environment: "prod",
        secretPath: "",
        requestId: "req-1",
        projectId: "proj-1",
        projectName: "Payments",
        secretKeys: ["A", "B"],
        approvalUrl: "https://ignored.test"
      }
    };

    // Action
    const message = renderTeamsMessage(notification, { orgId: "org-1", siteUrl: SITE });

    // Assert
    expect(message).toEqual({
      adaptiveCard: {
        type: "AdaptiveCard",
        $schema: SCHEMA,
        version: "1.5",
        body: [
          title("Secret approval request"),
          paragraph("A secret approval request has been opened by machine identity ident-1."),
          {
            type: "FactSet",
            facts: [
              { title: "Project", value: "Payments" },
              { title: "Environment", value: "prod" },
              { title: "Secret path", value: "/" },
              { title: "Secret Keys", value: "A, B" }
            ]
          }
        ],
        actions: [
          {
            type: "Action.OpenUrl",
            title: "View request in Infisical",
            url: `${SITE}/organizations/org-1/projects/secret-management/proj-1/approval?requestId=req-1`
          }
        ]
      }
    });
  });

  test("should render an access request with the note and the approval link", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.AccessRequest,
      payload: {
        requesterFullName: "Ada Lovelace",
        requesterEmail: "ada@example.com",
        isTemporary: false,
        secretPath: "/app",
        environment: "prod",
        projectName: "Payments",
        projectPath: "/p",
        permissions: ["read", "edit"],
        approvalUrl: "https://example.test/approve",
        note: "Release"
      }
    };

    // Action
    const message = renderTeamsMessage(notification, { orgId: "org-1", siteUrl: SITE });

    // Assert
    expect(message).toEqual({
      adaptiveCard: {
        type: "AdaptiveCard",
        $schema: SCHEMA,
        version: "1.5",
        body: [
          title("New access approval request pending for review"),
          paragraph(
            "Ada Lovelace (ada@example.com) has requested permanent access to path '/app' in the prod environment of Payments project."
          ),
          paragraph("The following permissions are requested: read, edit"),
          paragraph("**User Note**: Release")
        ],
        actions: [{ type: "Action.OpenUrl", title: "View request in Infisical", url: "https://example.test/approve" }]
      }
    });
  });

  test("should leave the note block out of an access request without a note", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.AccessRequest,
      payload: {
        requesterFullName: "Ada",
        requesterEmail: "ada@example.com",
        isTemporary: true,
        secretPath: "/",
        environment: "dev",
        projectName: "P",
        projectPath: "/p",
        permissions: ["read"],
        approvalUrl: "u"
      }
    };

    // Action
    const message = renderTeamsMessage(notification, { orgId: "org-1", siteUrl: SITE });

    // Assert
    expect(message?.adaptiveCard.body).toHaveLength(3);
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
        isTemporary: true,
        secretPath: "/app",
        environment: "prod",
        projectName: "Payments",
        projectPath: "/p",
        permissions: ["read"],
        approvalUrl: "https://example.test/approve",
        editNote: "Narrowed"
      }
    };

    // Action
    const message = renderTeamsMessage(notification, { orgId: "org-1", siteUrl: SITE });

    // Assert
    expect(message).toEqual({
      adaptiveCard: {
        type: "AdaptiveCard",
        $schema: SCHEMA,
        version: "1.5",
        body: [
          title("Updated access approval request pending for review"),
          paragraph(
            "Grace Hopper (grace@example.com) has updated the temporary access request from Ada Lovelace (ada@example.com) to /app in the prod environment of Payments."
          ),
          paragraph("The following permissions are requested: read"),
          paragraph("**Editor Note**: Narrowed")
        ],
        actions: [{ type: "Action.OpenUrl", title: "View request in Infisical", url: "https://example.test/approve" }]
      }
    });
  });

  test("should render nothing for a secret sync error, which Teams does not carry", () => {
    // Setup
    const notification: TSecretsChatNotification = {
      type: SecretsChatNotificationType.SecretSyncError,
      payload: {
        syncName: "s",
        syncActionLabel: "Sync",
        syncDestination: "AWS",
        failureMessage: "boom",
        syncUrl: "u",
        environment: "prod",
        secretPath: "/",
        projectName: "P",
        projectPath: "/p"
      }
    };

    // Action
    const message = renderTeamsMessage(notification, { orgId: "org-1", siteUrl: SITE });

    // Assert
    expect(message).toBeNull();
  });
});
