import { getWebhookPayload } from "./webhook-fns";
import { WebhookEvents, WebhookType } from "./webhook-types";

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
