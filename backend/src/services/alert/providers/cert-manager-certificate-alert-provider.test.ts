import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertPermissionAction, AlertTelemetryAction, TAlertContext } from "../alert-types";
import { TAlertCertificate } from "./cert-manager-certificate-alert-dal";
import {
  certManagerCertificateAlertProviderFactory,
  TCertManagerCertificateAlertProviderDep
} from "./cert-manager-certificate-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const RESOURCE_TYPE = "cert-manager.certificate";
const EXPIRY_EVENT = "cert-manager.certificate.expiry";
const ISSUANCE_EVENT = "cert-manager.certificate.issuance";
const APPLICATION_ID = "5b7d3f0e-8a1c-4e2b-9d6f-1a2b3c4d5e6f";
const OTHER_APPLICATION_ID = "6c8e4a1f-9b2d-4f3c-8e7a-2b3c4d5e6f70";
const PROFILE_ID = "7d9f5b2a-0c3e-4a4d-9f8b-3c4d5e6f7081";

const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const sampleCertificate = (overrides: Partial<TAlertCertificate> = {}): TAlertCertificate => ({
  id: "cert-1",
  serialNumber: "105d3b4c",
  commonName: "api.example.com",
  altNames: null,
  profileName: "tls-server",
  notAfter: futureDate(20),
  revocationReason: null,
  applicationName: "payments-api",
  ...overrides
});

const alertContext = (overrides: Partial<TAlertContext> = {}): TAlertContext => ({
  id: "alert-1",
  name: "project-expiry",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: RESOURCE_TYPE,
  resourceId: null,
  eventType: EXPIRY_EVENT,
  condition: { alertBefore: "30d" },
  ...overrides
});

const buildProvider = (opts?: {
  projectApplicationIds?: string[];
  projectProfileIds?: string[];
  onFindExpiring?: (args: Record<string, unknown>) => void;
  onFindByIds?: (args: Record<string, unknown>) => void;
  onFindApplicationIds?: (ids: string[]) => void;
  abilityRules?: { action: string; subject: string }[];
}) => {
  const dal = {
    findExpiringCertificates: async (args: Record<string, unknown>) => {
      opts?.onFindExpiring?.(args);
      return [];
    },
    findCertificatesByIds: async (args: Record<string, unknown>) => {
      opts?.onFindByIds?.(args);
      return [];
    },
    findProjectApplicationIds: async (_projectId: string, ids: string[]) => {
      opts?.onFindApplicationIds?.(ids);
      return ids.filter((id) => (opts?.projectApplicationIds ?? [APPLICATION_ID]).includes(id));
    },
    findProjectProfileIds: async (_projectId: string, ids: string[]) =>
      ids.filter((id) => (opts?.projectProfileIds ?? [PROFILE_ID]).includes(id))
  };
  const permissionService = {
    getProjectPermission: async () => ({
      permission: createMongoAbility(opts?.abilityRules ?? [{ action: "read", subject: "pki-alerts" }])
    })
  };
  return certManagerCertificateAlertProviderFactory({
    certManagerCertificateAlertDAL: dal,
    permissionService,
    licenseService: { getPlan: async () => ({ pkiEnterpriseAlerting: false }) }
  } as unknown as TCertManagerCertificateAlertProviderDep);
};

const actor = { actor: "user", actorId: "u1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

describe("cert manager project certificate alert provider", () => {
  test("is scope-wide and declares one scheduled and three event-triggered alerts", () => {
    const provider = buildProvider();
    expect(provider.supportsScopeWideAlerts).toBe(true);
    expect(provider.allowsMultipleAlertsPerEvent).toBe(true);
    expect(provider.events.map((event) => event.key)).toEqual([
      EXPIRY_EVENT,
      ISSUANCE_EVENT,
      "cert-manager.certificate.renewal",
      "cert-manager.certificate.revocation"
    ]);
  });

  test("conditions accept optional application and profile lists and reject anything else", () => {
    const provider = buildProvider();
    const expiry = provider.events.find((event) => event.key === EXPIRY_EVENT)!.conditionSchema;
    const issuance = provider.events.find((event) => event.key === ISSUANCE_EVENT)!.conditionSchema;

    expect(expiry.safeParse({ alertBefore: "30d" }).success).toBe(true);
    expect(
      expiry.safeParse({ alertBefore: "30d", applicationIds: [APPLICATION_ID], profileIds: [PROFILE_ID] }).success
    ).toBe(true);
    expect(expiry.safeParse({ alertBefore: "30d", applicationIds: ["not-a-uuid"] }).success).toBe(false);
    expect(expiry.safeParse({ alertBefore: "30d", filters: [] }).success).toBe(false);
    expect(expiry.safeParse({ alertBefore: "30d", applicationIds: [] }).success).toBe(false);
    expect(issuance.safeParse({ profileIds: [] }).success).toBe(false);
    const upper = expiry.safeParse({ alertBefore: "30d", applicationIds: [APPLICATION_ID.toUpperCase()] });
    expect(upper.success && (upper.data as { applicationIds: string[] }).applicationIds).toEqual([APPLICATION_ID]);
    expect(issuance.safeParse(null).success).toBe(true);
    expect(issuance.safeParse({ profileIds: [PROFILE_ID] }).success).toBe(true);
    expect(issuance.safeParse({ alertBefore: "30d" }).success).toBe(false);
  });

  test("findDueTargets scans the whole project narrowed by the condition's lists", async () => {
    let args: Record<string, unknown> | undefined;
    const provider = buildProvider({
      onFindExpiring: (value) => {
        args = value;
      }
    });
    await provider.findDueTargets({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: null,
      eventType: EXPIRY_EVENT,
      condition: { alertBefore: "2w", profileIds: [PROFILE_ID] },
      asOf: new Date()
    });
    expect(args).toMatchObject({ projectId: "proj-1", profileIds: [PROFILE_ID], alertBeforeInterval: "14 days" });
    expect(args?.applicationId).toBeUndefined();
  });

  test("findTargetsByIds applies the lists to event-triggered alerts", async () => {
    let args: Record<string, unknown> | undefined;
    const provider = buildProvider({
      onFindByIds: (value) => {
        args = value;
      }
    });
    await provider.findTargetsByIds({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: null,
      eventType: ISSUANCE_EVENT,
      condition: { applicationIds: [APPLICATION_ID] },
      targetIds: ["cert-1"]
    } as never);
    expect(args).toMatchObject({ projectId: "proj-1", applicationIds: [APPLICATION_ID], certificateIds: ["cert-1"] });
  });

  test("buildPayload names the project as the owner and lists each certificate's application", () => {
    const provider = buildProvider();
    const payload = provider.buildPayload(alertContext(), [sampleCertificate()], "https://app.infisical.com/view");

    expect(payload.resourceOwnerKind).toBe("Project");
    expect(payload.webhookType).toBe(`com.infisical.${EXPIRY_EVENT}`);
    expect(payload.eventLabel).toBe("Expiration");
    expect(payload.summary).toBe("1 certificate expiring within 30 days");
    expect(payload.items[0].fields).toContainEqual({ label: "Application", value: "payments-api" });
  });

  test("buildViewUrl opens the project inventory", async () => {
    await expect(buildProvider().buildViewUrl(alertContext())).resolves.toBe(
      "https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/inventory"
    );
  });

  test("assertPermission uses the project-level alerts permission", async () => {
    const provider = buildProvider();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", projectId: "proj-1", actor })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Create, orgId: "org-1", projectId: "proj-1", actor })
    ).rejects.toThrow();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", actor })
    ).rejects.toThrow("Certificate alerts must be created in a Certificate Manager project");
  });

  test("assertResourceInScope rejects a resource-bound project alert", async () => {
    const provider = buildProvider();
    await expect(provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1" })).resolves.toBeUndefined();
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1", resourceId: APPLICATION_ID })
    ).rejects.toThrow("can't be bound to a resource");
  });

  test("assertConditionInScope rejects applications and profiles from outside the project", async () => {
    const provider = buildProvider();
    await expect(
      provider.assertConditionInScope?.({
        orgId: "org-1",
        projectId: "proj-1",
        condition: { applicationIds: [APPLICATION_ID], profileIds: [PROFILE_ID] }
      })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertConditionInScope?.({
        orgId: "org-1",
        projectId: "proj-1",
        condition: { applicationIds: [OTHER_APPLICATION_ID] }
      })
    ).rejects.toThrow(`Application(s) not found in this project: '${OTHER_APPLICATION_ID}'`);
  });

  test("assertConditionInScope only checks ids the update adds, so a deleted one can stay", async () => {
    const lookups: string[][] = [];
    const provider = buildProvider({
      projectApplicationIds: [APPLICATION_ID],
      onFindApplicationIds: (ids) => lookups.push(ids)
    });
    await expect(
      provider.assertConditionInScope?.({
        orgId: "org-1",
        projectId: "proj-1",
        condition: { applicationIds: [OTHER_APPLICATION_ID, APPLICATION_ID] },
        previousCondition: { applicationIds: [OTHER_APPLICATION_ID] }
      })
    ).resolves.toBeUndefined();
    expect(lookups).toEqual([[APPLICATION_ID]]);
  });

  test("telemetry reports project alerts with the legacy alert type values", () => {
    const provider = buildProvider();
    expect(
      provider.getTelemetryEvent?.({
        action: AlertTelemetryAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: null,
        eventType: ISSUANCE_EVENT
      })
    ).toEqual({
      event: PostHogEventTypes.PkiAlertCreated,
      properties: { orgId: "org-1", projectId: "proj-1", alertType: "issuance" }
    });
  });
});
