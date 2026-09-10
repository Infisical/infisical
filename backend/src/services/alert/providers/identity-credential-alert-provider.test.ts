import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";
import {
  emitIdentityAuthMethodChanged,
  IdentityAuthMethodChange,
  IdentityAuthMethodChangePayloadSchema
} from "@app/services/identity/identity-auth-method-events";

import {
  ALERT_HISTORY_RETENTION_DAYS,
  AlertPermissionAction,
  MAX_DEDUP_WINDOW_HOURS,
  TAlertContext
} from "../alert-types";
import { TExpiringUaClientSecret } from "./identity-credential-alert-dal";
import {
  IDENTITY_AUTH_METHOD_CHANGED_EVENT,
  IDENTITY_AUTHENTICATION_EXPIRY_EVENT,
  IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
  identityCredentialAlertProviderFactory,
  TIdentityCredentialAlertProviderDep
} from "./identity-credential-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const sampleSecret = (overrides: Partial<TExpiringUaClientSecret> = {}): TExpiringUaClientSecret => ({
  id: "sec-1",
  description: "ci-secret",
  clientSecretPrefix: "abc123",
  identityId: "ident-1",
  identityName: "ci-runner",
  expiresAt: futureDate(5),
  ...overrides
});

const alertContext = (overrides: Partial<TAlertContext> = {}): TAlertContext => ({
  id: "alert-1",
  name: "ua-expiry",
  orgId: "org-1",
  resourceType: IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
  resourceId: null,
  eventType: IDENTITY_AUTHENTICATION_EXPIRY_EVENT,
  condition: { alertBefore: "30d" },
  ...overrides
});

const buildProvider = (opts?: {
  secrets?: TExpiringUaClientSecret[];
  onFind?: (args: {
    orgId: string;
    projectId?: string | null;
    identityId?: string | null;
    alertBeforeInterval: string;
    leadInterval: string;
    asOf: Date;
  }) => void;
  abilityRules?: { action: string; subject: string; conditions?: Record<string, unknown> }[];
  inOrg?: boolean;
  inProject?: boolean;
  // Owning project of the bound identity: null for an org-level identity, a project id when the
  // identity was created in project scope.
  ownerProjectId?: string | null;
  projectType?: string | null;
  identities?: { id: string; name: string }[];
  userLabel?: string;
}) => {
  const dal = {
    findIdentitiesByIds: async (ids: string[]) =>
      (opts?.identities ?? [{ id: "ident-1", name: "ci-runner" }]).filter((identity) => ids.includes(identity.id)),
    findUserLabelById: async () => opts?.userLabel,
    findExpiringUaClientSecrets: async (args: {
      orgId: string;
      projectId?: string | null;
      identityId?: string | null;
      alertBeforeInterval: string;
      leadInterval: string;
      asOf: Date;
    }) => {
      opts?.onFind?.(args);
      return opts?.secrets ?? [];
    },
    findIdentityInOrg: async () => ((opts?.inOrg ?? true) ? { projectId: opts?.ownerProjectId ?? null } : undefined),
    isIdentityInProject: async () => opts?.inProject ?? true,
    getProjectType: async () => opts?.projectType ?? null
  };
  const ability = () => createMongoAbility(opts?.abilityRules ?? [{ action: "read", subject: "identity" }]);
  const permissionService = {
    getOrgPermission: async () => ({ permission: ability() }),
    getProjectPermission: async () => ({ permission: ability() })
  };
  return identityCredentialAlertProviderFactory({
    identityCredentialAlertDAL: dal,
    permissionService
  } as unknown as TIdentityCredentialAlertProviderDep);
};

const actor = { actor: "user", actorId: "u1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

const eventSchema = (provider: ReturnType<typeof buildProvider>, key: string) =>
  provider.events.find((event) => event.key === key)!.conditionSchema;

const changePayload = (overrides: Record<string, unknown> = {}) => ({
  targetIds: ["ident-1"],
  authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
  change: IdentityAuthMethodChange.Added,
  actorType: ActorType.USER,
  actorId: "u1",
  changedAt: "2026-09-10T10:00:00.000Z",
  ...overrides
});

describe("identity credential alert provider", () => {
  test("expiry condition schema accepts 1d-90d and rejects everything else", () => {
    const schema = eventSchema(buildProvider(), IDENTITY_AUTHENTICATION_EXPIRY_EVENT);
    expect(schema.safeParse({ alertBefore: "1d" }).success).toBe(true);
    expect(schema.safeParse({ alertBefore: "30d" }).success).toBe(true);
    expect(schema.safeParse({ alertBefore: "90d" }).success).toBe(true);

    // Out of range.
    expect(schema.safeParse({ alertBefore: "0d" }).success).toBe(false);
    expect(schema.safeParse({ alertBefore: "91d" }).success).toBe(false);
    expect(schema.safeParse({ alertBefore: "3650d" }).success).toBe(false);

    // Units other than days are no longer accepted.
    expect(schema.safeParse({ alertBefore: "2w" }).success).toBe(false);
    expect(schema.safeParse({ alertBefore: "3m" }).success).toBe(false);
    expect(schema.safeParse({ alertBefore: "1y" }).success).toBe(false);

    expect(schema.safeParse({ alertBefore: "30" }).success).toBe(false);
    expect(schema.safeParse({ alertBefore: "nope" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  test("auth method change is event-triggered and takes no condition", () => {
    const provider = buildProvider();
    const event = provider.events.find((candidate) => candidate.key === IDENTITY_AUTH_METHOD_CHANGED_EVENT);
    expect(event?.triggerType).toBe("event");
    const schema = eventSchema(provider, IDENTITY_AUTH_METHOD_CHANGED_EVENT);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  // The auth method services emit through this helper and the provider parses the schema at delivery.
  // This is the one place the two are checked against each other.
  test("the emitted payload is accepted by the delivery schema", async () => {
    const emitted: unknown[] = [];
    const emitter = { emit: async (event: { payload: unknown }) => void emitted.push(event.payload) };
    const membership = { identity: { id: "ident-1", projectId: null }, scopeOrgId: "org-1" };

    await emitIdentityAuthMethodChanged(
      emitter,
      {
        membership,
        authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
        change: IdentityAuthMethodChange.CredentialAdded,
        actor: ActorType.USER,
        actorId: "u1",
        credential: { id: "cs-1", name: null }
      },
      {} as never
    );
    await emitIdentityAuthMethodChanged(
      emitter,
      {
        membership,
        authMethod: IdentityAuthMethod.TOKEN_AUTH,
        change: IdentityAuthMethodChange.Removed,
        actor: ActorType.PLATFORM
      },
      {} as never
    );

    expect(emitted).toHaveLength(2);
    for (const payload of emitted) {
      expect(IdentityAuthMethodChangePayloadSchema.safeParse(payload).success).toBe(true);
      expect((payload as { targetIds: string[] }).targetIds).toEqual(["ident-1"]);
    }
  });

  test("findTargetsByIds rehydrates the identity and the change from the event payload", async () => {
    const provider = buildProvider({ userLabel: "alice@example.com" });

    const targets = await provider.findTargetsByIds({
      orgId: "org-1",
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null,
      targetIds: ["ident-1"],
      payload: changePayload()
    });

    expect(targets).toHaveLength(1);
    const [target] = targets;
    expect(target.kind).toBe("auth-method-change");
    if (target.kind !== "auth-method-change") throw new Error("unexpected target kind");
    expect(target.identityName).toBe("ci-runner");
    expect(target.authMethod).toBe(IdentityAuthMethod.UNIVERSAL_AUTH);
    expect(target.change).toBe(IdentityAuthMethodChange.Added);
    expect(target.actorLabel).toBe("alice@example.com (user)");
    expect(target.changedAt).toEqual(new Date("2026-09-10T10:00:00.000Z"));
    expect(provider.targetId(target)).toBe("auth-method-change:ident-1:universal-auth:added");
  });

  test("findTargetsByIds drops an identity deleted between emit and delivery", async () => {
    const provider = buildProvider({ identities: [] });
    const targets = await provider.findTargetsByIds({
      orgId: "org-1",
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null,
      targetIds: ["ident-1"],
      payload: changePayload()
    });
    expect(targets).toEqual([]);
  });

  test("findTargetsByIds names a machine identity actor and falls back to the actor type", async () => {
    const provider = buildProvider({
      identities: [
        { id: "ident-1", name: "ci-runner" },
        { id: "ident-admin", name: "terraform" }
      ]
    });
    const byIdentity = await provider.findTargetsByIds({
      orgId: "org-1",
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null,
      targetIds: ["ident-1"],
      payload: changePayload({ actorType: ActorType.IDENTITY, actorId: "ident-admin" })
    });
    expect(byIdentity[0].kind === "auth-method-change" && byIdentity[0].actorLabel).toBe(
      "terraform (machine identity)"
    );

    const byPlatform = await provider.findTargetsByIds({
      orgId: "org-1",
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null,
      targetIds: ["ident-1"],
      payload: changePayload({ actorType: ActorType.PLATFORM, actorId: undefined })
    });
    expect(byPlatform[0].kind === "auth-method-change" && byPlatform[0].actorLabel).toBe("Infisical");
  });

  // A drifted emit site must surface in the outbox error, not as a notification with blank fields.
  test("findTargetsByIds rejects a payload the emitter contract does not describe", async () => {
    const provider = buildProvider();
    await expect(
      provider.findTargetsByIds({
        orgId: "org-1",
        resourceId: "ident-1",
        eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
        condition: null,
        targetIds: ["ident-1"],
        payload: { targetIds: ["ident-1"], authMethod: "carrier-pigeon" }
      })
    ).rejects.toThrow(/authMethod/);
  });

  test("a credential change carries the credential through the payload, the target id, and the fields", async () => {
    const provider = buildProvider({ userLabel: "alice@example.com" });
    const [target] = await provider.findTargetsByIds({
      orgId: "org-1",
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null,
      targetIds: ["ident-1"],
      payload: changePayload({
        change: IdentityAuthMethodChange.CredentialAdded,
        credentialId: "sec-9",
        credentialName: "github-actions"
      })
    });
    if (target.kind !== "auth-method-change") throw new Error("unexpected target kind");
    expect(target.credentialId).toBe("sec-9");
    expect(target.credentialName).toBe("github-actions");
    // Two secrets added to the same method must not collapse into one PagerDuty incident.
    expect(provider.targetId(target)).toBe("auth-method-change:ident-1:universal-auth:credential-added:sec-9");

    const context = alertContext({
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null
    });
    const payload = provider.buildPayload(context, [target], "https://app.infisical.com/x");
    expect(payload.summary).toBe(
      "Universal Auth client secret 'github-actions' was added to machine identity 'ci-runner'"
    );
    const [item] = payload.items;
    expect(item.fields?.find((f) => f.label === "Change")?.value).toBe("Credential Added");
    expect(item.fields?.find((f) => f.label === "Credential")?.value).toBe("github-actions");
  });

  test("a token revocation reads as a Token Auth credential change", async () => {
    const provider = buildProvider();
    const context = alertContext({
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null
    });
    const payload = provider.buildPayload(
      context,
      [
        {
          kind: "auth-method-change" as const,
          identityId: "ident-1",
          identityName: "ci-runner",
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.CredentialRevoked,
          actorLabel: "Infisical",
          changedAt: new Date("2026-09-10T10:00:00.000Z"),
          credentialId: "tok-1",
          credentialName: "deploy"
        }
      ],
      "https://app.infisical.com/x"
    );
    expect(payload.summary).toBe("Token Auth token 'deploy' was revoked from machine identity 'ci-runner'");
    // No credential field when the change is to the method itself.
    const methodOnly = provider.buildPayload(
      context,
      [
        {
          kind: "auth-method-change" as const,
          identityId: "ident-1",
          identityName: "ci-runner",
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.Updated,
          actorLabel: "Infisical",
          changedAt: new Date("2026-09-10T10:00:00.000Z")
        }
      ],
      "https://app.infisical.com/x"
    );
    expect(methodOnly.items[0].fields?.some((f) => f.label === "Credential")).toBe(false);
  });

  test("buildPayload for an auth method change names the method, the change, and who made it", async () => {
    const provider = buildProvider();
    const context = alertContext({
      resourceId: "ident-1",
      eventType: IDENTITY_AUTH_METHOD_CHANGED_EVENT,
      condition: null
    });
    const changedAt = new Date("2026-09-10T10:00:00.000Z");
    const target = {
      kind: "auth-method-change" as const,
      identityId: "ident-1",
      identityName: "ci-runner",
      authMethod: IdentityAuthMethod.AWS_AUTH,
      change: IdentityAuthMethodChange.Removed,
      actorLabel: "alice@example.com (user)",
      changedAt
    };
    const payload = provider.buildPayload(context, [target], "https://app.infisical.com/x");

    expect(payload.eventKey).toBe(IDENTITY_AUTH_METHOD_CHANGED_EVENT);
    expect(payload.webhookType).toBe("com.infisical.identity.authentication.auth-method-changed");
    expect(payload.severity).toBe("warning");
    expect(payload.summary).toBe("AWS Auth was removed from machine identity 'ci-runner'");
    expect(payload.alert).not.toHaveProperty("condition");

    const [item] = payload.items;
    expect(item.id).toBe("auth-method-change:ident-1:aws-auth:removed");
    expect(item.title).toBe("ci-runner");
    expect(item.fields?.find((f) => f.label === "Auth Method")?.value).toBe("AWS Auth");
    expect(item.fields?.find((f) => f.label === "Change")?.value).toBe("Removed");
    expect(item.fields?.find((f) => f.label === "Changed By")?.value).toBe("alice@example.com (user)");
    expect(item.fields?.find((f) => f.label === "Changed At")?.value).toContain("2026");
  });

  test("findDueTargets converts alertBefore to a postgres interval and tags credential type", async () => {
    let seenArgs:
      | {
          alertBeforeInterval: string;
          leadInterval: string;
          projectId?: string | null;
          identityId?: string | null;
          asOf: Date;
        }
      | undefined;
    const provider = buildProvider({
      secrets: [sampleSecret()],
      onFind: (args) => {
        seenArgs = args;
      }
    });

    const asOf = new Date("2026-07-24T00:00:00.000Z");
    const targets = await provider.findDueTargets({
      orgId: "org-1",
      resourceId: "ident-1",
      eventType: IDENTITY_AUTHENTICATION_EXPIRY_EVENT,
      condition: { alertBefore: "30d" },
      asOf
    });

    expect(seenArgs?.alertBeforeInterval).toBe("30 days");
    expect(seenArgs?.leadInterval).toBe("1 day");
    expect(seenArgs?.identityId).toBe("ident-1");
    expect(seenArgs?.asOf).toBe(asOf);
    expect(targets).toHaveLength(1);
    expect(provider.targetId(targets[0])).toBe("ua-client-secret:sec-1");
  });

  test("findDueTargets scopes the query to the alert's project so it cannot leak org-wide credentials", async () => {
    let seenArgs: { projectId?: string | null } | undefined;
    const provider = buildProvider({
      onFind: (args) => {
        seenArgs = args;
      }
    });

    await provider.findDueTargets({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: null,
      eventType: IDENTITY_AUTHENTICATION_EXPIRY_EVENT,
      condition: { alertBefore: "30d" },
      asOf: new Date("2026-07-24T00:00:00.000Z")
    });

    expect(seenArgs?.projectId).toBe("proj-1");
  });

  test("buildPayload produces neutral items and severity", async () => {
    const provider = buildProvider();
    const expiresAt = futureDate(3);
    const target = {
      kind: "expiring-credential" as const,
      credentialType: "ua-client-secret" as const,
      ...sampleSecret({ expiresAt })
    };
    const viewUrl = await provider.buildViewUrl(alertContext());
    const payload = provider.buildPayload(alertContext(), [target], viewUrl);

    expect(payload.eventKey).toBe(IDENTITY_AUTHENTICATION_EXPIRY_EVENT);
    expect(payload.severity).toBe("critical"); // 3 days out
    expect(payload.alert.viewUrl).toBe(viewUrl);

    const item = payload.items[0];
    expect(item.title).toBe("ci-runner");
    expect(item.fields?.some((f) => f.label === "Days Until Expiry")).toBe(false);
    expect(item.fields?.find((f) => f.label === "Secret Name")?.value).toBe("ci-secret");
    expect(item.fields?.find((f) => f.label === "Secret Type")?.value).toBe("Universal Auth Client Secret");

    const expires = item.fields?.find((f) => f.label === "Expires")?.value;
    expect(expires).toContain(String(expiresAt.getUTCFullYear()));
    expect(expires).toContain("UTC");
  });

  test("buildViewUrl points to the org identities tab for an org-scoped alert", async () => {
    const provider = buildProvider();
    expect(await provider.buildViewUrl(alertContext())).toBe(
      "https://app.infisical.com/organizations/org-1/access-management?selectedTab=identities"
    );
  });

  test("buildViewUrl deep-links to the bound identity when resourceId is set (org scope)", async () => {
    const provider = buildProvider();
    expect(await provider.buildViewUrl(alertContext({ resourceId: "ident-1" }))).toContain("/identities/ident-1");
  });

  test("buildViewUrl deep-links into the project for a project-scoped alert", async () => {
    const provider = buildProvider({ projectType: "secret-manager" });
    const url = await provider.buildViewUrl(alertContext({ projectId: "proj-1", resourceId: "ident-1" }));
    expect(url).toBe(
      "https://app.infisical.com/organizations/org-1/projects/secret-management/proj-1/identities/ident-1"
    );
  });

  test("buildViewUrl links to the project access-management identities tab when no resource is bound", async () => {
    const provider = buildProvider({ projectType: "kms" });
    const url = await provider.buildViewUrl(alertContext({ projectId: "proj-1" }));
    expect(url).toBe(
      "https://app.infisical.com/organizations/org-1/projects/kms/proj-1/access-management?selectedTab=identities"
    );
  });

  test("buildViewUrl falls back to the org view when the project can't be resolved", async () => {
    const provider = buildProvider({ projectType: null });
    const url = await provider.buildViewUrl(alertContext({ projectId: "proj-gone", resourceId: "ident-1" }));
    expect(url).toBe("https://app.infisical.com/organizations/org-1/identities/ident-1");
  });

  test("dedup window spans alertBefore + the scan lead (30d -> 744h, 1d -> 48h) with a 24h floor", () => {
    const provider = buildProvider();
    expect(provider.dedupWindowHours?.({ alertBefore: "30d" })).toBe(744);
    expect(provider.dedupWindowHours?.({ alertBefore: "1d" })).toBe(48);
    // Falls back to the default when the condition can't be parsed.
    expect(provider.dedupWindowHours?.({ alertBefore: "bad" })).toBe(24);
    expect(provider.dedupWindowHours?.({ alertBefore: "91d" })).toBe(24);
  });

  test("dedup window never outruns history retention, so it can't read rows the prune has deleted", () => {
    const provider = buildProvider();
    // 90d + the 1d scan lead would be 2184h, past the 90-day retention: capped so the dedup lookup
    // always lands on rows that still exist.
    expect(provider.dedupWindowHours?.({ alertBefore: "90d" })).toBe(MAX_DEDUP_WINDOW_HOURS);
    expect(MAX_DEDUP_WINDOW_HOURS).toBeLessThan(ALERT_HISTORY_RETENTION_DAYS * 24);
  });

  test("assertPermission allows read but denies create when only read is granted (org scope)", async () => {
    const provider = buildProvider({ abilityRules: [{ action: "read", subject: "identity" }] });
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", actor })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Create, orgId: "org-1", actor })
    ).rejects.toThrow();
  });

  test("assertPermission uses the project identity permission when the alert is project-scoped", async () => {
    const provider = buildProvider({ abilityRules: [{ action: "read", subject: "identity" }] });
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", projectId: "proj-1", actor })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Edit, orgId: "org-1", projectId: "proj-1", actor })
    ).rejects.toThrow();
  });

  test("assertPermission passes identityId into the subject for resource-bound project alerts", async () => {
    // Custom role / additional privilege scoped to a single identity. The check must
    // supply the identity id so CASL can match the conditioned rule; a bare subject
    // would be rejected. Edit-scoped alerts deliver credential metadata, so the role
    // must hold read on the same identity in addition to edit.
    const provider = buildProvider({
      abilityRules: [
        { action: "edit", subject: "identity", conditions: { identityId: "ident-1" } },
        { action: "read", subject: "identity", conditions: { identityId: "ident-1" } }
      ]
    });
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Edit,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "ident-1",
        actor
      })
    ).resolves.toBeUndefined();
    // A different identity must not satisfy the identity-scoped rule.
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Edit,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "ident-2",
        actor
      })
    ).rejects.toThrow();
  });

  test("assertPermission rejects a filter-based project alert when the actor only has a conditional identity grant", async () => {
    // The actor can edit exactly one identity. A filter-based alert (no resourceId) fans
    // out data for every matching identity, so a conditional grant must NOT authorize it
    // even though the bare subject check would otherwise pass.
    const provider = buildProvider({
      abilityRules: [{ action: "edit", subject: "identity", conditions: { identityId: "ident-1" } }]
    });
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Edit, orgId: "org-1", projectId: "proj-1", actor })
    ).rejects.toThrow();
  });

  test("assertPermission allows a filter-based project alert with unconditional project-wide identity edit + read", async () => {
    const provider = buildProvider({
      abilityRules: [
        { action: "edit", subject: "identity" },
        { action: "read", subject: "identity" }
      ]
    });
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Edit, orgId: "org-1", projectId: "proj-1", actor })
    ).resolves.toBeUndefined();
  });

  test("assertPermission denies create/edit when identity edit is granted but read is missing (org scope)", async () => {
    // The alert fans out identity credential metadata, which normally requires identity read.
    // An edit-only role must not be able to stand up that data feed.
    const provider = buildProvider({ abilityRules: [{ action: "edit", subject: "identity" }] });
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Create, orgId: "org-1", actor })
    ).rejects.toThrow();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Edit, orgId: "org-1", actor })
    ).rejects.toThrow();
  });

  test("assertPermission denies a resource-bound create/edit when read on that identity is missing", async () => {
    const provider = buildProvider({
      abilityRules: [{ action: "edit", subject: "identity", conditions: { identityId: "ident-1" } }]
    });
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Edit,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "ident-1",
        actor
      })
    ).rejects.toThrow();
  });

  test("assertPermission denies a filter-based create/edit with project-wide edit but no read", async () => {
    const provider = buildProvider({ abilityRules: [{ action: "edit", subject: "identity" }] });
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Edit, orgId: "org-1", projectId: "proj-1", actor })
    ).rejects.toThrow();
  });

  test("assertPermission allows delete with identity edit only (delete delivers no data)", async () => {
    const provider = buildProvider({ abilityRules: [{ action: "edit", subject: "identity" }] });
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Delete, orgId: "org-1", actor })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Delete,
        orgId: "org-1",
        projectId: "proj-1",
        actor
      })
    ).resolves.toBeUndefined();
  });

  test("assertResourceInScope no-ops when there is no resource (filter-based alert)", async () => {
    const provider = buildProvider({ inOrg: false });
    // inOrg=false would reject if checked, but with no resourceId it must return without checking.
    await expect(provider.assertResourceInScope({ orgId: "org-1" })).resolves.toBeUndefined();
  });

  test("assertResourceInScope passes for an identity in the org", async () => {
    const provider = buildProvider({ inOrg: true });
    await expect(provider.assertResourceInScope({ orgId: "org-1", resourceId: "ident-1" })).resolves.toBeUndefined();
  });

  test("assertResourceInScope rejects an identity not in the org", async () => {
    const provider = buildProvider({ inOrg: false });
    await expect(provider.assertResourceInScope({ orgId: "org-1", resourceId: "foreign" })).rejects.toThrow();
  });

  test("assertResourceInScope rejects an identity not in the project when project-scoped", async () => {
    const provider = buildProvider({ inOrg: true, inProject: false });
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1", resourceId: "ident-1" })
    ).rejects.toThrow();
  });

  // A project-owned identity keeps its project's permission boundary: its client secret metadata is
  // gated by that project's identity permission, which an org-scoped alert never evaluates. Org
  // membership alone must not be enough to bind it.
  test("assertResourceInScope rejects a project-owned identity on an org-scoped alert", async () => {
    const provider = buildProvider({ inOrg: true, ownerProjectId: "proj-1" });
    await expect(provider.assertResourceInScope({ orgId: "org-1", resourceId: "ident-1" })).rejects.toThrow(
      /belongs to a project/
    );
  });

  test("assertResourceInScope rejects a project-owned identity on another project's alert", async () => {
    const provider = buildProvider({ inOrg: true, inProject: true, ownerProjectId: "proj-1" });
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-2", resourceId: "ident-1" })
    ).rejects.toThrow(/belongs to a project/);
  });

  test("assertResourceInScope allows a project-owned identity on its own project's alert", async () => {
    const provider = buildProvider({ inOrg: true, inProject: true, ownerProjectId: "proj-1" });
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1", resourceId: "ident-1" })
    ).resolves.toBeUndefined();
  });
});
