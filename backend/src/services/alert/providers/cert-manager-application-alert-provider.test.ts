import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType } from "../alert-channel-types";
import { AlertPermissionAction, AlertTelemetryAction, TAlertContext } from "../alert-types";
import {
  certManagerApplicationAlertProviderFactory,
  TCertManagerApplicationAlertProviderDep
} from "./cert-manager-application-alert-provider";
import { TAlertCertificate } from "./cert-manager-certificate-alert-dal";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const RESOURCE_TYPE = "cert-manager.application";
const EXPIRY_EVENT = "cert-manager.application.certificate.expiry";
const ISSUANCE_EVENT = "cert-manager.application.certificate.issuance";
const REVOCATION_EVENT = "cert-manager.application.certificate.revocation";

const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const sampleCertificate = (overrides: Partial<TAlertCertificate> = {}): TAlertCertificate => ({
  id: "cert-1",
  serialNumber: "105d3b4c",
  commonName: "api.example.com",
  altNames: "api.example.com, www.api.example.com",
  profileName: "tls-server",
  notAfter: futureDate(5),
  revocationReason: null,
  applicationName: "payments-api",
  ...overrides
});

const alertContext = (overrides: Partial<TAlertContext> = {}): TAlertContext => ({
  id: "alert-1",
  name: "tls-expiry",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: RESOURCE_TYPE,
  resourceId: "app-1",
  eventType: EXPIRY_EVENT,
  condition: { alertBefore: "30d" },
  ...overrides
});

const buildProvider = (opts?: {
  application?: { id: string; name: string; projectId: string; orgId: string };
  certificates?: TAlertCertificate[];
  onFindExpiring?: (args: Record<string, unknown>) => void;
  onFindByIds?: (args: Record<string, unknown>) => void;
  onFindNames?: (ids: string[], orgId: string) => void;
  abilityRules?: { action: string; subject: string }[];
  pkiEnterpriseAlerting?: boolean;
}) => {
  const application = opts?.application ?? { id: "app-1", name: "payments-api", projectId: "proj-1", orgId: "org-1" };
  const dal = {
    findApplicationById: async (id: string) => (id === application.id ? application : undefined),
    findApplicationNamesByIds: async (ids: string[], orgId: string) => {
      opts?.onFindNames?.(ids, orgId);
      return ids.includes(application.id) && orgId === application.orgId
        ? [{ id: application.id, name: application.name }]
        : [];
    },
    findExpiringCertificates: async (args: Record<string, unknown>) => {
      opts?.onFindExpiring?.(args);
      return opts?.certificates ?? [];
    },
    findCertificatesByIds: async (args: Record<string, unknown>) => {
      opts?.onFindByIds?.(args);
      return opts?.certificates ?? [];
    }
  };
  const ability = () => createMongoAbility(opts?.abilityRules ?? [{ action: "read", subject: "pki-alerts" }]);
  const permissionService = {
    getProjectPermission: vi.fn(async () => ({ permission: ability() })),
    getResourcePermission: vi.fn(async () => ({ permission: ability() }))
  };
  const licenseService = {
    getPlan: async () => ({ pkiEnterpriseAlerting: opts?.pkiEnterpriseAlerting ?? false })
  };
  const provider = certManagerApplicationAlertProviderFactory({
    certManagerCertificateAlertDAL: dal,
    permissionService,
    licenseService
  } as unknown as TCertManagerApplicationAlertProviderDep);
  return { provider, permissionService };
};

const actor = { actor: "user", actorId: "u1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

const expiryConditionSchema = (provider: ReturnType<typeof buildProvider>["provider"]) =>
  provider.events.find((event) => event.key === EXPIRY_EVENT)!.conditionSchema;

describe("cert manager application alert provider", () => {
  test("expiry condition accepts 1 to 365 days in any unit and rejects everything else", () => {
    const schema = expiryConditionSchema(buildProvider().provider);
    ["1d", "30d", "2w", "12m", "1y", "365d"].forEach((alertBefore) =>
      expect(schema.safeParse({ alertBefore }).success).toBe(true)
    );
    ["0d", "366d", "2y", "13m", "30", "d", "30h", "12345d"].forEach((alertBefore) =>
      expect(schema.safeParse({ alertBefore }).success).toBe(false)
    );
    expect(schema.safeParse({ alertBefore: "30d", filters: [] }).success).toBe(false);
  });

  test("issuance, renewal and revocation are event-triggered and take no condition", () => {
    const { provider } = buildProvider();
    const eventKeys = provider.events.filter((event) => event.key !== EXPIRY_EVENT).map((event) => event.key);
    expect(eventKeys).toEqual([ISSUANCE_EVENT, "cert-manager.application.certificate.renewal", REVOCATION_EVENT]);
    provider.events
      .filter((event) => event.key !== EXPIRY_EVENT)
      .forEach((event) => {
        expect(event.conditionSchema.safeParse(null).success).toBe(true);
        expect(event.conditionSchema.safeParse({ alertBefore: "30d" }).success).toBe(false);
      });
  });

  test("findDueTargets converts alertBefore to days and scopes the scan to the alert's application", async () => {
    let args: Record<string, unknown> | undefined;
    const { provider } = buildProvider({
      onFindExpiring: (value) => {
        args = value;
      }
    });
    await provider.findDueTargets({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: "app-1",
      eventType: EXPIRY_EVENT,
      condition: { alertBefore: "2w" },
      asOf: new Date()
    });
    expect(args).toMatchObject({ projectId: "proj-1", applicationId: "app-1", alertBeforeInterval: "14 days" });
  });

  test("findDueTargets and findTargetsByIds return nothing for an alert with no application", async () => {
    const { provider } = buildProvider({ certificates: [sampleCertificate()] });
    await expect(
      provider.findDueTargets({
        orgId: "org-1",
        projectId: "proj-1",
        eventType: EXPIRY_EVENT,
        condition: { alertBefore: "30d" },
        asOf: new Date()
      })
    ).resolves.toEqual([]);
    await expect(
      provider.findTargetsByIds({
        orgId: "org-1",
        projectId: "proj-1",
        eventType: ISSUANCE_EVENT,
        condition: null,
        targetIds: ["cert-1"]
      } as never)
    ).resolves.toEqual([]);
  });

  test("dedup window tightens as the lead time shrinks and each window ends before the next daily run", () => {
    const { provider } = buildProvider();
    expect(provider.dedupWindowHours?.({ alertBefore: "7d" })).toBe(20);
    expect(provider.dedupWindowHours?.({ alertBefore: "30d" })).toBe(44);
    expect(provider.dedupWindowHours?.({ alertBefore: "12w" })).toBe(164);
    expect(provider.dedupWindowHours?.({ alertBefore: "1y" })).toBe(716);
    expect(provider.dedupWindowHours?.({ alertBefore: "1y", dailyReminder: true })).toBe(20);
  });

  test("buildPayload summarises expiring certificates with the lead time and singular wording", async () => {
    const { provider } = buildProvider();
    const payload = provider.buildPayload(
      alertContext({ condition: { alertBefore: "1d" } }),
      [sampleCertificate()],
      "https://app.infisical.com/view"
    );
    expect(payload.summary).toBe("1 certificate in application 'payments-api' expiring within 1 day");
    expect(payload.alert.condition).toBe("1d");
    expect(payload.webhookType).toBe(`com.infisical.${EXPIRY_EVENT}`);
    expect(payload.severity).toBe("critical");
    expect(payload.items[0]).toMatchObject({ id: "cert-1", title: "api.example.com", identifier: "105d3b4c" });
    expect(payload.items[0].fields?.map((field) => field.label)).toEqual(["SANs", "Profile", "Expires"]);
  });

  test("buildPayload for a revocation names the certificate and adds the revocation reason", async () => {
    const { provider } = buildProvider();
    const payload = provider.buildPayload(
      alertContext({ eventType: REVOCATION_EVENT, condition: null }),
      [sampleCertificate({ revocationReason: 1, altNames: null, profileName: null })],
      "https://app.infisical.com/view"
    );
    expect(payload.summary).toBe("Certificate 'api.example.com' was revoked in application 'payments-api'");
    expect(payload.severity).toBe("warning");
    expect(payload.alert.condition).toBeUndefined();
    expect(payload.items[0].fields).toEqual([
      { label: "Expires", value: expect.any(String) as string },
      { label: "Revocation Reason", value: "Key Compromise" }
    ]);
  });

  test("buildViewUrl deep-links to the application and falls back to the applications list", async () => {
    const { provider } = buildProvider();
    await expect(provider.buildViewUrl(alertContext())).resolves.toBe(
      "https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/applications/payments-api"
    );
    await expect(provider.buildViewUrl(alertContext({ resourceId: "missing" }))).resolves.toBe(
      "https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/applications"
    );
  });

  test("assertPermission checks the application's resource permission when the alert is bound to one", async () => {
    const { provider, permissionService } = buildProvider();
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Read,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "app-1",
        actor
      })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "app-1",
        actor
      })
    ).rejects.toThrow();
    expect(permissionService.getResourcePermission).toHaveBeenCalled();
    expect(permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test("assertPermission falls back to the project permission without an application and requires a project", async () => {
    const { provider, permissionService } = buildProvider();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", projectId: "proj-1", actor })
    ).resolves.toBeUndefined();
    expect(permissionService.getProjectPermission).toHaveBeenCalled();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", actor })
    ).rejects.toThrow("Certificate alerts must be created in Certificate Manager");
  });

  test("assertResourceInScope rejects an application from another project or org", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1", resourceId: "app-1" })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-2", resourceId: "app-1" })
    ).rejects.toThrow("Application with ID 'app-1' not found in Certificate Manager");
    await expect(
      provider.assertResourceInScope({ orgId: "org-2", projectId: "proj-1", resourceId: "app-1" })
    ).rejects.toThrow();
    await expect(provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1" })).resolves.toBeUndefined();
  });

  test("resolveProjectId returns the application's project and hides applications from other orgs", async () => {
    const { provider } = buildProvider();
    await expect(provider.resolveProjectId?.({ orgId: "org-1", resourceId: "app-1" })).resolves.toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2", resourceId: "app-1" })).rejects.toThrow(
      "Application with ID 'app-1' not found"
    );
  });

  test("assertChannelTypesAllowed lets email through and gates other channels on the plan", async () => {
    await expect(
      buildProvider().provider.assertChannelTypesAllowed?.({ orgId: "org-1", channelTypes: [AlertChannelType.EMAIL] })
    ).resolves.toBeUndefined();
    await expect(
      buildProvider().provider.assertChannelTypesAllowed?.({
        orgId: "org-1",
        channelTypes: [AlertChannelType.EMAIL, AlertChannelType.SLACK]
      })
    ).rejects.toThrow("plan restriction");
    await expect(
      buildProvider({ pkiEnterpriseAlerting: true }).provider.assertChannelTypesAllowed?.({
        orgId: "org-1",
        channelTypes: [AlertChannelType.SLACK]
      })
    ).resolves.toBeUndefined();
  });

  test("getResourceNames scopes the lookup to the caller's org", async () => {
    let lookup: { ids: string[]; orgId: string } | undefined;
    const { provider } = buildProvider({
      onFindNames: (ids, orgId) => {
        lookup = { ids, orgId };
      }
    });
    const names = await provider.getResourceNames?.({ orgId: "org-1", resourceIds: ["app-1"] });
    expect(lookup).toEqual({ ids: ["app-1"], orgId: "org-1" });
    expect(names?.get("app-1")).toBe("payments-api");
    const foreign = await provider.getResourceNames?.({ orgId: "org-2", resourceIds: ["app-1"] });
    expect(foreign?.size).toBe(0);
  });

  test("telemetry reports the same alertType values as the deprecated application routes", () => {
    const { provider } = buildProvider();
    expect(
      provider.getTelemetryEvent?.({
        action: AlertTelemetryAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "app-1",
        eventType: EXPIRY_EVENT
      })
    ).toEqual({
      event: PostHogEventTypes.PkiAlertCreated,
      properties: {
        orgId: "org-1",
        projectId: "proj-1",
        applicationId: "app-1",
        alertScope: PkiAlertScope.Application,
        alertType: "expiration"
      }
    });
    expect(
      provider.getTelemetryEvent?.({
        action: AlertTelemetryAction.Delete,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "app-1",
        eventType: ISSUANCE_EVENT
      })?.event
    ).toBe(PostHogEventTypes.PkiAlertDeleted);
  });
});
