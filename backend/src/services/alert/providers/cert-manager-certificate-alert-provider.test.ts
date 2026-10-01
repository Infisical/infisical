import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertAuditAction, AlertPermissionAction, AlertTelemetryAction, TAlertContext } from "../alert-types";
import { TAlertCertificate } from "./cert-manager-certificate-alert-dal";
import {
  certManagerCertificateAlertProviderFactory,
  TCertManagerCertificateAlertProviderDep
} from "./cert-manager-certificate-alert-provider";

vi.mock("@app/lib/logger", () => ({ logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} } }));

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
  status: "active",
  notBefore: new Date("2026-09-01T00:00:00.000Z"),
  notAfter: futureDate(20),
  revokedAt: null,
  revocationReason: null,
  applicationId: "app-1",
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
  nameLookupFails?: boolean;
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
      ids.filter((id) => (opts?.projectProfileIds ?? [PROFILE_ID]).includes(id)),
    findApplicationNamesByIds: async (ids: string[]) => {
      if (opts?.nameLookupFails) throw new Error("replica unavailable");
      return ids.filter((id) => id === APPLICATION_ID).map((id) => ({ id, name: "payments-api" }));
    },
    findProfileNamesByIds: async (_projectId: string, ids: string[]) =>
      ids.filter((id) => id === PROFILE_ID).map((id) => ({ id, name: "tls-server" }))
  };
  const permissionService = {
    getProjectPermission: async () => ({
      permission: createMongoAbility(opts?.abilityRules ?? [{ action: "read", subject: "pki-alerts" }])
    })
  };
  return certManagerCertificateAlertProviderFactory({
    certManagerCertificateAlertDAL: dal,
    permissionService,
    licenseService: { getPlan: async () => ({ pkiEnterpriseAlerting: false }) },
    certManagerProjectResolver: {
      getActiveProjectId: async (orgId: string) => (orgId === "org-1" ? "proj-1" : null)
    }
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

  test("dedup windows end before the next daily run, whatever filters the condition carries", () => {
    const provider = buildProvider();
    const applicationIds = ["0e0d19d0-5edd-4984-b5cb-028e8b4a23a2"];
    expect(provider.dedupWindowHours?.({ alertBefore: "7d", applicationIds })).toBe(20);
    expect(provider.dedupWindowHours?.({ alertBefore: "30d", applicationIds })).toBe(44);
    expect(provider.dedupWindowHours?.({ alertBefore: "1y", dailyReminder: true, applicationIds })).toBe(20);
  });

  test("findScheduledTargets scans the whole project narrowed by the condition's lists", async () => {
    let args: Record<string, unknown> | undefined;
    const provider = buildProvider({
      onFindExpiring: (value) => {
        args = value;
      }
    });
    await provider.findScheduledTargets({
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

  test("findEventTargets applies the lists to event-triggered alerts", async () => {
    let args: Record<string, unknown> | undefined;
    const provider = buildProvider({
      onFindByIds: (value) => {
        args = value;
      }
    });
    await provider.findEventTargets({
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

    expect(payload.resourceOwnerKind).toBe("Certificate Manager");
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
    ).rejects.toThrow("Certificate alerts must be created in Certificate Manager");
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
        projectId: "proj-1",
        condition: { applicationIds: [APPLICATION_ID], profileIds: [PROFILE_ID] }
      })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertConditionInScope?.({
        projectId: "proj-1",
        condition: { applicationIds: [OTHER_APPLICATION_ID] }
      })
    ).rejects.toThrow(`Application(s) not found in Certificate Manager: '${OTHER_APPLICATION_ID}'`);
  });

  test("assertConditionInScope only checks ids the update adds, so a deleted one can stay", async () => {
    const lookups: string[][] = [];
    const provider = buildProvider({
      projectApplicationIds: [APPLICATION_ID],
      onFindApplicationIds: (ids) => lookups.push(ids)
    });
    await expect(
      provider.assertConditionInScope?.({
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
      properties: {
        orgId: "org-1",
        projectId: "proj-1",
        alertScope: PkiAlertScope.CertificateManager,
        alertType: "issuance"
      }
    });
  });

  test("emits its own audit events, naming the alert's application and profile filters", async () => {
    const provider = buildProvider();
    const alert = {
      id: "alert-1",
      name: "prod-expiry",
      orgId: "org-1",
      projectId: "proj-1",
      resourceType: RESOURCE_TYPE,
      resourceId: null,
      eventType: EXPIRY_EVENT,
      condition: {
        alertBefore: "30d",
        applicationIds: [APPLICATION_ID, OTHER_APPLICATION_ID],
        profileIds: [PROFILE_ID]
      }
    };
    const metadata = {
      alertId: "alert-1",
      name: "prod-expiry",
      eventType: EXPIRY_EVENT,
      applications: [
        { id: APPLICATION_ID, name: "payments-api" },
        { id: OTHER_APPLICATION_ID, name: null }
      ],
      profiles: [{ id: PROFILE_ID, name: "tls-server" }]
    };

    await expect(provider.getAuditEvent?.({ action: AlertAuditAction.Create, alert })).resolves.toEqual({
      type: "create-pki-certificate-alert",
      metadata
    });
    await expect(provider.getAuditEvent?.({ action: AlertAuditAction.Delete, alert })).resolves.toEqual({
      type: "delete-pki-certificate-alert",
      metadata
    });
    await expect(
      provider.getAuditEvent?.({
        action: AlertAuditAction.TestChannel,
        test: {
          resourceType: RESOURCE_TYPE,
          alertId: "alert-1",
          alertName: "prod-expiry",
          channelType: "email",
          success: true
        }
      })
    ).resolves.toMatchObject({
      type: "test-pki-certificate-alert-channel",
      metadata: { alertId: "alert-1", alertName: "prod-expiry", channelType: "email", success: true }
    });
  });

  test("logs the audit event with null filter names when the name lookup fails", async () => {
    const provider = buildProvider({ nameLookupFails: true });
    const event = await provider.getAuditEvent?.({
      action: AlertAuditAction.Update,
      alert: {
        id: "alert-1",
        name: "prod-expiry",
        orgId: "org-1",
        projectId: "proj-1",
        resourceType: RESOURCE_TYPE,
        resourceId: null,
        eventType: EXPIRY_EVENT,
        condition: { alertBefore: "30d", applicationIds: [APPLICATION_ID], profileIds: [PROFILE_ID] }
      }
    });
    expect(event).toMatchObject({
      type: "update-pki-certificate-alert",
      metadata: {
        applications: [{ id: APPLICATION_ID, name: null }],
        profiles: [{ id: PROFILE_ID, name: null }]
      }
    });
  });

  test("resolveProjectId resolves the org's Certificate Manager project", async () => {
    const provider = buildProvider();
    await expect(provider.resolveProjectId?.({ orgId: "org-1" })).resolves.toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2" })).rejects.toThrow(
      "Certificate Manager isn't set up for this organization"
    );
  });
});
