import { ActorType } from "@app/services/auth/auth-type";

import { getWebhookPayload } from "./webhook-fns";
import { ChangeRequestWebhookAction, WebhookEvents, WebhookType } from "./webhook-types";

const projectFields = {
  projectId: "proj-1",
  projectName: "Secrets management",
  environment: "prod",
  environmentName: "Production",
  secretPath: "/api"
};

describe("getWebhookPayload: secrets.modified", () => {
  test("general payload keeps the documented shape", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.SecretModified,
      payload: { ...projectFields, type: WebhookType.GENERAL, changedBy: "Ada Lovelace" }
    });

    expect(result).toEqual({
      event: "secrets.modified",
      project: {
        workspaceId: "proj-1",
        projectId: "proj-1",
        projectName: "Secrets management",
        environment: "prod",
        environmentName: "Production",
        secretPath: "/api",
        changedBy: "Ada Lovelace",
        changedByActorType: undefined
      }
    });
  });

  test("slack payload carries a text line and one attachment", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.SecretModified,
      payload: { ...projectFields, type: WebhookType.SLACK }
    }) as { text: string; attachments: { fields: { title: string }[] }[] };

    expect(result.text).toBe("A secret value has been added or modified.");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].fields.map((f) => f.title)).toContain("Project");
  });

  test("teams payload is an adaptive card with a fact set", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.SecretModified,
      payload: { ...projectFields, type: WebhookType.MICROSOFT_TEAMS }
    }) as { attachments: { content: { body: { type: string }[] } }[] };

    expect(result.attachments[0].content.body.map((b) => b.type)).toEqual(["TextBlock", "FactSet"]);
  });
});

describe("getWebhookPayload: secrets.rotation-failed", () => {
  test("general payload nests rotation detail under project", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.SecretRotationFailed,
      payload: {
        ...projectFields,
        type: WebhookType.GENERAL,
        rotationName: "db-password",
        errorMessage: "connection refused",
        triggeredManually: false
      }
    }) as { project: Record<string, unknown> };

    expect(result.project.rotationName).toBe("db-password");
    expect(result.project.errorMessage).toBe("connection refused");
    expect(result.project.triggeredManually).toBe(false);
  });
});

describe("getWebhookPayload: honey-token.triggered", () => {
  test("general payload puts honey token detail in a sibling block", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.HoneyTokenTriggered,
      payload: {
        ...projectFields,
        type: WebhookType.GENERAL,
        honeyTokenName: "decoy-key",
        eventName: "GetCallerIdentity",
        sourceIp: "203.0.113.4",
        awsRegion: "us-east-1"
      }
    }) as { honeyToken: Record<string, unknown> };

    expect(result.honeyToken).toEqual({
      name: "decoy-key",
      eventName: "GetCallerIdentity",
      sourceIp: "203.0.113.4",
      awsRegion: "us-east-1"
    });
  });
});

const changeRequestPayload = {
  projectId: "proj-1",
  projectName: "Secrets management",
  environment: "prod",
  environmentName: "Production",
  secretPath: "/api",
  action: ChangeRequestWebhookAction.Merged,
  request: {
    id: "req-1",
    slug: "clever-otter",
    url: "https://app.infisical.com/organizations/org-1/projects/secret-management/proj-1/approval?requestId=req-1",
    status: "close",
    hasMerged: true,
    isBypassed: false,
    policy: { id: "pol-1", name: "Production secrets", enforcementLevel: "hard" },
    requestedBy: { type: ActorType.USER as const, id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:42:00.000Z"
  }
};

describe("getWebhookPayload: secrets.change-request.modified", () => {
  test("general payload nests project and request", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.ChangeRequestModified,
      payload: { ...changeRequestPayload, type: WebhookType.GENERAL }
    });

    expect(result).toEqual({
      event: "secrets.change-request.modified",
      action: "merged",
      project: { id: "proj-1", name: "Secrets management" },
      request: {
        id: "req-1",
        slug: "clever-otter",
        url: changeRequestPayload.request.url,
        target: {
          environment: { name: "Production", slug: "prod" },
          secretPath: "/api"
        },
        status: "close",
        hasMerged: true,
        isBypassed: false,
        policy: { id: "pol-1", name: "Production secrets", enforcementLevel: "hard" },
        requestedBy: { type: "user", id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:42:00.000Z"
      }
    });
  });

  test("general payload carries a null requester when the author was deleted", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.ChangeRequestModified,
      payload: {
        ...changeRequestPayload,
        type: WebhookType.GENERAL,
        request: { ...changeRequestPayload.request, requestedBy: null }
      }
    }) as { request: { requestedBy: unknown } };

    expect(result.request.requestedBy).toBeNull();
  });

  test("general payload carries no free text fields", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.ChangeRequestModified,
      payload: { ...changeRequestPayload, type: WebhookType.GENERAL }
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("commitMessage");
    expect(serialized).not.toContain("bypassReason");
  });

  test("slack payload names the transition", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.ChangeRequestModified,
      payload: { ...changeRequestPayload, type: WebhookType.SLACK }
    }) as { text: string; attachments: { fields: { title: string; value?: string }[] }[] };

    expect(result.text).toBe("A secret change request was merged.");
    expect(result.attachments[0].fields.map((f) => f.title)).toEqual([
      "Project",
      "Environment",
      "Secret Path",
      "Policy",
      "Status",
      "Requested By",
      "Bypassed"
    ]);
  });

  test("teams payload is an adaptive card with a fact set", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.ChangeRequestModified,
      payload: { ...changeRequestPayload, type: WebhookType.MICROSOFT_TEAMS }
    }) as { attachments: { content: { body: { type: string }[] } }[] };

    expect(result.attachments[0].content.body.map((b) => b.type)).toEqual(["TextBlock", "FactSet"]);
  });
});
