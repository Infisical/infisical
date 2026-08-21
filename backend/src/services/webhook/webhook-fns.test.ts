import { ActorType } from "@app/services/auth/auth-type";

import { getWebhookPayload, isWebhookPathSubscribed } from "./webhook-fns";
import { AccessRequestWebhookAction, ChangeRequestWebhookAction, WebhookEvents, WebhookType } from "./webhook-types";

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

  test("general payload strips free text fields present on the input", () => {
    const eventWithFreeText = {
      type: WebhookEvents.ChangeRequestModified,
      payload: {
        ...changeRequestPayload,
        type: WebhookType.GENERAL,
        commitMessage: "fixed the bug",
        bypassReason: "on-call approved",
        request: {
          ...changeRequestPayload.request,
          commitMessage: "fixed the bug",
          bypassReason: "on-call approved"
        }
      }
    } as unknown as Parameters<typeof getWebhookPayload>[0];

    const result = getWebhookPayload(eventWithFreeText);

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

  test.each([
    [WebhookType.SLACK, "Merged", { hasMerged: true, status: "close" }],
    [WebhookType.SLACK, "Closed", { hasMerged: false, status: "close" }],
    [WebhookType.SLACK, "Open", { hasMerged: false, status: "open" }],
    [WebhookType.MICROSOFT_TEAMS, "Merged", { hasMerged: true, status: "close" }],
    [WebhookType.MICROSOFT_TEAMS, "Closed", { hasMerged: false, status: "close" }],
    [WebhookType.MICROSOFT_TEAMS, "Open", { hasMerged: false, status: "open" }]
  ] as const)("%s payload renders status %s rather than the raw column value", (channel, label, state) => {
    const result = getWebhookPayload({
      type: WebhookEvents.ChangeRequestModified,
      payload: {
        ...changeRequestPayload,
        type: channel,
        request: { ...changeRequestPayload.request, ...state }
      }
    });

    const facts =
      channel === WebhookType.SLACK
        ? (result as { attachments: { fields: { title: string; value: string }[] }[] }).attachments[0].fields
        : (
            result as {
              attachments: { content: { body: { facts?: { title: string; value: string }[] }[] } }[];
            }
          ).attachments[0].content.body[1].facts!;

    expect(facts.find((f) => f.title === "Status")?.value).toBe(label);
  });
});

const accessRequestPayload = {
  projectId: "proj-1",
  projectName: "Secrets management",
  environment: "prod",
  environmentName: "Production",
  secretPath: "/api/*",
  action: AccessRequestWebhookAction.Reviewed,
  request: {
    id: "areq-1",
    url: "https://app.infisical.com/organizations/org-1/projects/secret-management/proj-1/approval?selectedTab=resource-requests&requestId=areq-1",
    status: "approved",
    isBypassed: false,
    policy: {
      id: "pol-2",
      name: "Production access",
      enforcementLevel: "soft",
      hasSequencedApprovers: true
    },
    requestedAccess: {
      isTemporary: true,
      temporaryRange: "1h",
      permissions: [
        { subject: "secrets", actions: ["read", "edit"] },
        { subject: "secret-folders", actions: ["create"] }
      ]
    },
    requestedBy: { type: ActorType.USER as const, id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
    expiresAt: "2026-08-21T10:00:00.000Z",
    approvedAt: "2026-08-20T10:42:00.000Z",
    revokedAt: null,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:42:00.000Z"
  }
};

describe("getWebhookPayload: secrets.access-request.modified", () => {
  test("general payload nests requested access under the request", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.AccessRequestModified,
      payload: { ...accessRequestPayload, type: WebhookType.GENERAL }
    });

    expect(result).toEqual({
      event: "secrets.access-request.modified",
      action: "reviewed",
      project: { id: "proj-1", name: "Secrets management" },
      request: {
        id: "areq-1",
        url: accessRequestPayload.request.url,
        status: "approved",
        isBypassed: false,
        policy: {
          id: "pol-2",
          name: "Production access",
          enforcementLevel: "soft",
          hasSequencedApprovers: true
        },
        requestedAccess: {
          target: {
            environment: { name: "Production", slug: "prod" },
            secretPath: "/api/*"
          },
          isTemporary: true,
          temporaryRange: "1h",
          permissions: [
            { subject: "secrets", actions: ["read", "edit"] },
            { subject: "secret-folders", actions: ["create"] }
          ]
        },
        requestedBy: { type: "user", id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
        expiresAt: "2026-08-21T10:00:00.000Z",
        approvedAt: "2026-08-20T10:42:00.000Z",
        revokedAt: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:42:00.000Z"
      }
    });
  });

  test("permissions use code identifiers, never prose", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.AccessRequestModified,
      payload: { ...accessRequestPayload, type: WebhookType.GENERAL }
    }) as { request: { requestedAccess: { permissions: { subject: string }[] } } };

    expect(result.request.requestedAccess.permissions[1].subject).toBe("secret-folders");
    expect(JSON.stringify(result)).not.toContain("Secret Folders");
  });

  test("general payload strips free text fields present on the input", () => {
    const eventWithFreeText = {
      type: WebhookEvents.AccessRequestModified,
      payload: {
        ...accessRequestPayload,
        type: WebhookType.GENERAL,
        note: "Need temporary access to unblock incident-482",
        editNote: "Narrowed scope to read-only after review",
        bypassReason: "On-call approved during the outage",
        request: {
          ...accessRequestPayload.request,
          note: "Need temporary access to unblock incident-482",
          editNote: "Narrowed scope to read-only after review",
          bypassReason: "On-call approved during the outage"
        }
      }
    } as unknown as Parameters<typeof getWebhookPayload>[0];

    const result = getWebhookPayload(eventWithFreeText);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Need temporary access to unblock incident-482");
    expect(serialized).not.toContain("Narrowed scope to read-only after review");
    expect(serialized).not.toContain("On-call approved during the outage");
  });

  test("general payload excludes the packed CASL rule tuples, only the identifier list ships", () => {
    const eventWithPackedRules = {
      type: WebhookEvents.AccessRequestModified,
      payload: {
        ...accessRequestPayload,
        type: WebhookType.GENERAL,
        request: {
          ...accessRequestPayload.request,
          permissions: [
            { subject: ["secrets"], action: ["read", "edit"], conditions: { environment: "prod" }, inverted: false }
          ]
        }
      }
    } as unknown as Parameters<typeof getWebhookPayload>[0];

    const result = getWebhookPayload(eventWithPackedRules) as {
      request: { requestedAccess: { permissions: unknown[] } };
    };

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("conditions");
    expect(serialized).not.toContain("inverted");
    expect(result.request.requestedAccess.permissions).toEqual(
      accessRequestPayload.request.requestedAccess.permissions
    );
  });

  test("slack payload renders permissions as a joined string", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.AccessRequestModified,
      payload: { ...accessRequestPayload, type: WebhookType.SLACK }
    }) as { text: string; attachments: { fields: { title: string; value?: string }[] }[] };

    expect(result.text).toBe("An access request was reviewed.");
    const permissionField = result.attachments[0].fields.find((f) => f.title === "Requested Access");
    expect(permissionField?.value).toBe("secrets (read, edit), secret-folders (create)");
  });

  test("teams payload is an adaptive card with a fact set", () => {
    const result = getWebhookPayload({
      type: WebhookEvents.AccessRequestModified,
      payload: { ...accessRequestPayload, type: WebhookType.MICROSOFT_TEAMS }
    }) as { attachments: { content: { body: { type: string }[] } }[] };

    expect(result.attachments[0].content.body.map((b) => b.type)).toEqual(["TextBlock", "FactSet"]);
  });
});

describe("isWebhookPathSubscribed", () => {
  describe("concrete event paths use pattern matching", () => {
    test.each([
      ["/api/billing", "/api/*", true],
      ["/api/billing", "/**", true],
      ["/api/billing", "/web/*", false],
      ["/", "/", true]
    ])("event %s against hook %s is %s", (eventPath, hookPath, expected) => {
      expect(isWebhookPathSubscribed(WebhookEvents.ChangeRequestModified, eventPath, hookPath)).toBe(expected);
    });
  });

  describe("access request paths are globs and use overlap", () => {
    test.each([
      ["/api/billing", "/api/*", true],
      ["/api/*", "/api/billing", true],
      ["/**", "/", true],
      ["/api/*", "/**", true],
      ["/api/*", "/web/*", false],
      ["/prod-a/*", "/prod-b/*", false]
    ])("request %s against hook %s is %s", (requestPath, hookPath, expected) => {
      expect(isWebhookPathSubscribed(WebhookEvents.AccessRequestModified, requestPath, hookPath)).toBe(expected);
    });
  });
});
