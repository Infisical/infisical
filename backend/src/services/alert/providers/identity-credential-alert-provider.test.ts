import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { AlertPermissionAction, TAlertContext } from "../alert-types";
import { TExpiringUaClientSecret } from "./identity-credential-alert-dal";
import {
  IDENTITY_CREDENTIAL_EXPIRY_EVENT,
  IDENTITY_CREDENTIAL_RESOURCE_TYPE,
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
  resourceType: IDENTITY_CREDENTIAL_RESOURCE_TYPE,
  resourceId: null,
  eventType: IDENTITY_CREDENTIAL_EXPIRY_EVENT,
  condition: { alertBefore: "30d" },
  filters: null,
  ...overrides
});

const buildProvider = (opts?: {
  secrets?: TExpiringUaClientSecret[];
  onFind?: (args: {
    orgId: string;
    projectId?: string | null;
    identityId?: string | null;
    alertBeforeInterval: string;
  }) => void;
  abilityRules?: { action: string; subject: string }[];
  inOrg?: boolean;
  inProject?: boolean;
  projectType?: string | null;
}) => {
  const dal = {
    findExpiringUaClientSecrets: async (args: {
      orgId: string;
      projectId?: string | null;
      identityId?: string | null;
      alertBeforeInterval: string;
    }) => {
      opts?.onFind?.(args);
      return opts?.secrets ?? [];
    },
    isIdentityInOrg: async () => opts?.inOrg ?? true,
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

describe("identity credential alert provider", () => {
  test("condition schema accepts alertBefore formats and rejects junk", () => {
    const provider = buildProvider();
    expect(provider.conditionSchema.safeParse({ alertBefore: "30d" }).success).toBe(true);
    expect(provider.conditionSchema.safeParse({ alertBefore: "2w" }).success).toBe(true);
    expect(provider.conditionSchema.safeParse({ alertBefore: "nope" }).success).toBe(false);
    expect(provider.conditionSchema.safeParse({}).success).toBe(false);
  });

  test("findDueTargets converts alertBefore to a postgres interval and tags credential type", async () => {
    let seenArgs: { alertBeforeInterval: string; projectId?: string | null; identityId?: string | null } | undefined;
    const provider = buildProvider({
      secrets: [sampleSecret()],
      onFind: (args) => {
        seenArgs = args;
      }
    });

    const targets = await provider.findDueTargets({
      orgId: "org-1",
      resourceId: "ident-1",
      eventType: IDENTITY_CREDENTIAL_EXPIRY_EVENT,
      condition: { alertBefore: "30d" },
      filters: null
    });

    expect(seenArgs?.alertBeforeInterval).toBe("30 days");
    expect(seenArgs?.identityId).toBe("ident-1");
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
      eventType: IDENTITY_CREDENTIAL_EXPIRY_EVENT,
      condition: { alertBefore: "30d" },
      filters: null
    });

    expect(seenArgs?.projectId).toBe("proj-1");
  });

  test("buildPayload produces neutral items and severity", async () => {
    const provider = buildProvider();
    const expiresAt = futureDate(3);
    const target = { credentialType: "ua-client-secret" as const, ...sampleSecret({ expiresAt }) };
    const viewUrl = await provider.buildViewUrl(alertContext());
    const payload = provider.buildPayload(alertContext(), [target], viewUrl);

    expect(payload.eventKey).toBe(IDENTITY_CREDENTIAL_EXPIRY_EVENT);
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

  test("dedup window spans the lead time (30d -> 720h) with a 24h floor", () => {
    const provider = buildProvider();
    expect(provider.dedupWindowHours?.({ alertBefore: "30d" })).toBe(720);
    expect(provider.dedupWindowHours?.({ alertBefore: "1d" })).toBe(24);
    expect(provider.dedupWindowHours?.({ alertBefore: "bad" })).toBe(24);
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
});
