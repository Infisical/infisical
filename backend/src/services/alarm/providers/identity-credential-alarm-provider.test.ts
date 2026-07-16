import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { AlarmPermissionAction, TAlarmContext } from "../alarm-types";
import { TExpiringUaClientSecret } from "./identity-credential-alarm-dal";
import {
  IDENTITY_CREDENTIAL_EXPIRY_EVENT,
  IDENTITY_CREDENTIAL_RESOURCE_TYPE,
  identityCredentialAlarmProviderFactory,
  TIdentityCredentialAlarmProviderDep
} from "./identity-credential-alarm-provider";

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

const alarmContext = (overrides: Partial<TAlarmContext> = {}): TAlarmContext => ({
  id: "alarm-1",
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
  onFind?: (args: { orgId: string; identityId?: string | null; alertBeforeInterval: string }) => void;
  abilityRules?: { action: string; subject: string }[];
  inOrg?: boolean;
  inProject?: boolean;
}) => {
  const dal = {
    findExpiringUaClientSecrets: async (args: {
      orgId: string;
      identityId?: string | null;
      alertBeforeInterval: string;
    }) => {
      opts?.onFind?.(args);
      return opts?.secrets ?? [];
    },
    isIdentityInOrg: async () => opts?.inOrg ?? true,
    isIdentityInProject: async () => opts?.inProject ?? true
  };
  const ability = () => createMongoAbility(opts?.abilityRules ?? [{ action: "read", subject: "identity" }]);
  const permissionService = {
    getOrgPermission: async () => ({ permission: ability() }),
    getProjectPermission: async () => ({ permission: ability() })
  };
  return identityCredentialAlarmProviderFactory({
    identityCredentialAlarmDAL: dal,
    permissionService
  } as unknown as TIdentityCredentialAlarmProviderDep);
};

const actor = { actor: "user", actorId: "u1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

describe("identity credential alarm provider", () => {
  test("condition schema accepts alertBefore formats and rejects junk", () => {
    const provider = buildProvider();
    expect(provider.conditionSchema.safeParse({ alertBefore: "30d" }).success).toBe(true);
    expect(provider.conditionSchema.safeParse({ alertBefore: "2w" }).success).toBe(true);
    expect(provider.conditionSchema.safeParse({ alertBefore: "nope" }).success).toBe(false);
    expect(provider.conditionSchema.safeParse({}).success).toBe(false);
  });

  test("findDueTargets converts alertBefore to a postgres interval and tags credential type", async () => {
    let seenArgs: { alertBeforeInterval: string; identityId?: string | null } | undefined;
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

  test("buildPayload produces neutral items and severity", () => {
    const provider = buildProvider();
    const target = { credentialType: "ua-client-secret" as const, ...sampleSecret({ expiresAt: futureDate(3) }) };
    const payload = provider.buildPayload(alarmContext(), [target]);

    expect(payload.eventKey).toBe(IDENTITY_CREDENTIAL_EXPIRY_EVENT);
    expect(payload.severity).toBe("critical"); // 3 days out
    expect(payload.items[0].fields?.some((f) => f.label === "Days Until Expiry")).toBe(true);
    expect(payload.alarm.viewUrl).toContain("/organizations/org-1/identities");
  });

  test("buildPayload deep-links to the bound identity when resourceId is set", () => {
    const provider = buildProvider();
    const target = { credentialType: "ua-client-secret" as const, ...sampleSecret() };
    const payload = provider.buildPayload(alarmContext({ resourceId: "ident-1" }), [target]);
    expect(payload.alarm.viewUrl).toContain("/identities/ident-1");
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
      provider.assertPermission({ action: AlarmPermissionAction.Read, orgId: "org-1", actor })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({ action: AlarmPermissionAction.Create, orgId: "org-1", actor })
    ).rejects.toThrow();
  });

  test("assertPermission uses the project identity permission when the alarm is project-scoped", async () => {
    const provider = buildProvider({ abilityRules: [{ action: "read", subject: "identity" }] });
    await expect(
      provider.assertPermission({ action: AlarmPermissionAction.Read, orgId: "org-1", projectId: "proj-1", actor })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({ action: AlarmPermissionAction.Edit, orgId: "org-1", projectId: "proj-1", actor })
    ).rejects.toThrow();
  });

  test("assertResourceInScope no-ops when there is no resource (filter-based alarm)", async () => {
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
