import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType } from "../alert-channel-types";
import { AlertAuditAction, AlertPermissionAction, AlertTelemetryAction, TAlertContext } from "../alert-types";
import { TApplicationAlertCertificate } from "./cert-manager-application-alert-dal";
import {
  certManagerApplicationAlertProviderFactory,
  TCertManagerApplicationAlertProviderDep
} from "./cert-manager-application-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const RESOURCE_TYPE = "cert-manager.application";
const EXPIRY_EVENT = "cert-manager.application.certificate.expiry";
const ISSUANCE_EVENT = "cert-manager.application.certificate.issuance";
const REVOCATION_EVENT = "cert-manager.application.certificate.revocation";
const SIGNER_EXPIRY_EVENT = "cert-manager.signer-certificate.expiry";
const APPLICATION_ID = "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90";
const OTHER_APPLICATION_ID = "6c8e4a1f-9b2d-4f3c-8e7a-2b3c4d5e6f70";
const PROFILE_ID = "7d9f5b2a-0c3e-4a4d-9f8b-3c4d5e6f7081";

const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const sampleCertificate = (overrides: Partial<TApplicationAlertCertificate> = {}): TApplicationAlertCertificate => ({
  id: "cert-1",
  serialNumber: "105d3b4c",
  commonName: "api.example.com",
  altNames: "api.example.com, www.api.example.com",
  profileId: "profile-1",
  profileName: "tls-server",
  status: "active",
  notBefore: new Date("2026-09-01T00:00:00.000Z"),
  notAfter: futureDate(5),
  revokedAt: null,
  revocationReason: null,
  applicationId: "app-1",
  applicationName: "payments-api",
  ...overrides
});

const alertContext = (overrides: Partial<TAlertContext> = {}): TAlertContext => ({
  id: "alert-1",
  name: "tls-expiry",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: RESOURCE_TYPE,
  resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
  eventType: EXPIRY_EVENT,
  condition: { alertBefore: "30d" },
  ...overrides
});

const buildProvider = (opts?: {
  application?: { id: string; name: string; projectId: string; orgId: string };
  certificates?: TApplicationAlertCertificate[];
  onFindExpiring?: (args: Record<string, unknown>) => void;
  onFindExpiringSigners?: (args: Record<string, unknown>) => void;
  onFindByIds?: (args: Record<string, unknown>) => void;
  onFindNames?: (ids: string[], orgId: string) => void;
  onFindApplicationIds?: (ids: string[]) => void;
  abilityRules?: { action: string; subject: string; inverted?: boolean; conditions?: unknown }[];
  projectRoles?: string[];
  pkiEnterpriseAlerting?: boolean;
}) => {
  const application = opts?.application ?? {
    id: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
    name: "payments-api",
    projectId: "proj-1",
    orgId: "org-1"
  };
  const dal = {
    findApplicationById: async (id: string) => (id === application.id ? application : undefined),
    findApplicationNamesByIds: async (ids: string[], orgId: string) => {
      opts?.onFindNames?.(ids, orgId);
      return ids.some((id) => id.toLowerCase() === application.id) && orgId === application.orgId
        ? [{ id: application.id, name: application.name }]
        : [];
    },
    findExpiringCertificates: async (args: Record<string, unknown>) => {
      opts?.onFindExpiring?.(args);
      return opts?.certificates ?? [];
    },
    findExpiringSignerCertificates: async (args: Record<string, unknown>) => {
      opts?.onFindExpiringSigners?.(args);
      return opts?.certificates ?? [];
    },
    findCertificatesByIds: async (args: Record<string, unknown>) => {
      opts?.onFindByIds?.(args);
      return opts?.certificates ?? [];
    },
    findProjectApplicationIds: async (_projectId: string, ids: string[]) => {
      opts?.onFindApplicationIds?.(ids);
      return ids.some((id) => id.toLowerCase() === application.id) ? [application.id] : [];
    },
    findProjectProfileIds: async (_projectId: string, ids: string[]) => ids.filter((id) => id === PROFILE_ID),
    findProfileNamesByIds: async (_projectId: string, ids: string[]) =>
      ids.filter((id) => id === PROFILE_ID).map((id) => ({ id, name: "tls-server" }))
  };
  const ability = () =>
    createMongoAbility((opts?.abilityRules ?? [{ action: "read", subject: "pki-alerts" }]) as never);
  const permissionService = {
    getResourcePermission: vi.fn(async () => ({ permission: ability() })),
    getProjectPermission: vi.fn(async () => ({
      permission: ability(),
      hasRole: (role: string) => (opts?.projectRoles ?? []).includes(role)
    }))
  };
  const licenseService = {
    getPlan: async () => ({ pkiEnterpriseAlerting: opts?.pkiEnterpriseAlerting ?? false })
  };
  const provider = certManagerApplicationAlertProviderFactory({
    certManagerApplicationAlertDAL: dal,
    permissionService,
    licenseService,
    certManagerProjectResolver: {
      getActiveProjectId: async (orgId: string) => (orgId === "org-1" ? "proj-1" : null)
    }
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

  test("issuance, renewal and revocation are event-triggered and take only optional filters", () => {
    const { provider } = buildProvider();
    expect(provider.supportsScopeWideAlerts).toBe(true);
    const eventTriggered = provider.events.filter((event) => event.triggerType === "event");
    expect(eventTriggered.map((event) => event.key)).toEqual([
      ISSUANCE_EVENT,
      "cert-manager.application.certificate.renewal",
      REVOCATION_EVENT
    ]);
    eventTriggered.forEach((event) => {
      expect(event.conditionSchema.safeParse(null).success).toBe(true);
      expect(event.conditionSchema.safeParse({ profileIds: [PROFILE_ID] }).success).toBe(true);
      expect(event.conditionSchema.safeParse({ profileIds: [] }).success).toBe(false);
      expect(event.conditionSchema.safeParse({ alertBefore: "30d" }).success).toBe(false);
    });
  });

  test("filters must be non-empty UUID lists and are stored as sent", () => {
    const schema = expiryConditionSchema(buildProvider().provider);
    expect(
      schema.safeParse({ alertBefore: "30d", applicationIds: [APPLICATION_ID], profileIds: [PROFILE_ID] }).success
    ).toBe(true);
    expect(schema.safeParse({ alertBefore: "30d", applicationIds: ["not-a-uuid"] }).success).toBe(false);
    expect(schema.safeParse({ alertBefore: "30d", applicationIds: [] }).success).toBe(false);
    const upper = schema.safeParse({ alertBefore: "30d", applicationIds: [APPLICATION_ID.toUpperCase()] });
    expect(upper.success && (upper.data as { applicationIds: string[] }).applicationIds).toEqual([
      APPLICATION_ID.toUpperCase()
    ]);
  });

  test("filters reject an ID listed twice, in any case, instead of storing the duplicate", () => {
    const schema = expiryConditionSchema(buildProvider().provider);
    const duplicated = schema.safeParse({
      alertBefore: "30d",
      applicationIds: [APPLICATION_ID, APPLICATION_ID.toUpperCase()]
    });
    expect(duplicated.success).toBe(false);
    expect(duplicated.error?.issues[0].message).toBe(
      `applicationIds lists the same ID more than once: '${APPLICATION_ID.toUpperCase()}'`
    );
    expect(schema.safeParse({ alertBefore: "30d", profileIds: [PROFILE_ID, PROFILE_ID] }).success).toBe(false);
  });

  test("filter IDs match case-insensitively when checked and named", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertConditionInScope?.({
        projectId: "proj-1",
        condition: { applicationIds: [APPLICATION_ID.toUpperCase()] }
      })
    ).resolves.toBeUndefined();
    const names = await provider.getFilters?.({
      orgId: "org-1",
      projectId: "proj-1",
      alerts: [{ id: "alert-1", condition: { applicationIds: [APPLICATION_ID.toUpperCase()] } }]
    });
    expect(names?.get("alert-1")).toEqual({
      applications: [{ id: APPLICATION_ID.toUpperCase(), name: "payments-api" }],
      profiles: []
    });
  });

  test("findScheduledTargets converts alertBefore to days and scopes the scan to the alert's application", async () => {
    let args: Record<string, unknown> | undefined;
    const { provider } = buildProvider({
      onFindExpiring: (value) => {
        args = value;
      }
    });
    await provider.findScheduledTargets({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
      eventType: EXPIRY_EVENT,
      condition: { alertBefore: "2w" },
      asOf: new Date()
    });
    expect(args).toMatchObject({
      projectId: "proj-1",
      applicationId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
      alertBeforeInterval: "14 days"
    });
  });

  test("findScheduledTargets and findEventTargets scan the whole project for an alert with no application", async () => {
    let scheduledArgs: Record<string, unknown> | undefined;
    let eventArgs: Record<string, unknown> | undefined;
    const { provider } = buildProvider({
      onFindExpiring: (value) => {
        scheduledArgs = value;
      },
      onFindByIds: (value) => {
        eventArgs = value;
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
    await provider.findEventTargets({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: null,
      eventType: ISSUANCE_EVENT,
      condition: { applicationIds: [APPLICATION_ID] },
      targetIds: ["cert-1"]
    } as never);

    expect(scheduledArgs).toMatchObject({
      projectId: "proj-1",
      profileIds: [PROFILE_ID],
      alertBeforeInterval: "14 days"
    });
    expect(scheduledArgs?.applicationId).toBeNull();
    expect(eventArgs).toMatchObject({
      projectId: "proj-1",
      applicationIds: [APPLICATION_ID],
      certificateIds: ["cert-1"]
    });
  });

  test("dedup window tightens as the lead time shrinks and a daily reminder forces 24h", () => {
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
    expect(payload.eventKey).toBe(EXPIRY_EVENT);
    expect(payload.webhookSource).toBe(`/applications/${alertContext().resourceId}/alerts/alert-1`);
    expect(payload.alert.resourceId).toBe(alertContext().resourceId);
    expect(payload.severity).toBe("critical");
    expect(payload.items[0]).toMatchObject({ id: "cert-1", title: "api.example.com" });
    expect(payload.items[0].fields?.map((field) => field.label)).toEqual([
      "Serial Number",
      "SANs",
      "Profile",
      "Expires"
    ]);
    expect(payload.items[0].resource).toEqual({
      id: "cert-1",
      serialNumber: "105d3b4c",
      commonName: "api.example.com",
      altNames: ["api.example.com", "www.api.example.com"],
      status: "active",
      notBefore: "2026-09-01T00:00:00.000Z",
      notAfter: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
      revokedAt: null,
      revocationReason: null,
      profileId: "profile-1",
      profileName: "tls-server",
      applicationId: "app-1",
      applicationName: "payments-api"
    });
  });

  test("buildPayload names a certificate without a common name by its first SAN, then its serial", async () => {
    const { provider } = buildProvider();
    const issuance = alertContext({ eventType: ISSUANCE_EVENT, condition: null });
    const bySan = provider.buildPayload(issuance, [sampleCertificate({ commonName: "" })], "https://x");
    expect(bySan.summary).toBe("Certificate 'api.example.com' was issued in application 'payments-api'");
    expect(bySan.items[0].title).toBe("api.example.com");
    const bySerial = provider.buildPayload(
      issuance,
      [sampleCertificate({ commonName: "", altNames: null })],
      "https://x"
    );
    expect(bySerial.items[0].title).toBe("105d3b4c");
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
      { label: "Serial Number", value: "105d3b4c" },
      { label: "Expires", value: expect.any(String) as string },
      { label: "Revocation Reason", value: "Key Compromise" }
    ]);
  });

  test("emits application-specific audit events carrying the application", () => {
    const { provider } = buildProvider();
    const alert = {
      id: "alert-1",
      name: "tls-expiry",
      resourceType: "cert-manager.application",
      resourceId: "app-1",
      resourceName: "payments-api",
      eventType: EXPIRY_EVENT
    };
    const metadata = {
      applicationId: "app-1",
      applicationName: "payments-api",
      alertId: "alert-1",
      name: "tls-expiry",
      eventType: EXPIRY_EVENT
    };

    expect(provider.getAuditEvent?.({ action: AlertAuditAction.Create, alert })).toEqual({
      type: "create-pki-application-alert",
      metadata
    });
    expect(provider.getAuditEvent?.({ action: AlertAuditAction.Update, alert })).toEqual({
      type: "update-pki-application-alert",
      metadata
    });
    expect(provider.getAuditEvent?.({ action: AlertAuditAction.Delete, alert })).toEqual({
      type: "delete-pki-application-alert",
      metadata
    });
    expect(
      provider.getAuditEvent?.({
        action: AlertAuditAction.TestChannel,
        test: {
          resourceType: "cert-manager.application",
          resourceId: "app-1",
          resourceName: "payments-api",
          alertId: "alert-1",
          alertName: "tls-expiry",
          channelId: "channel-1",
          channelName: "Email",
          channelType: "email",
          success: true,
          deliveredTo: 1
        }
      })
    ).toEqual({
      type: "test-pki-application-alert-channel",
      metadata: {
        applicationId: "app-1",
        applicationName: "payments-api",
        alertId: "alert-1",
        alertName: "tls-expiry",
        channelId: "channel-1",
        channelName: "Email",
        channelType: "email",
        success: true,
        deliveredTo: 1,
        error: undefined
      }
    });
  });

  test("buildViewUrl deep-links to the application and falls back to the applications list", async () => {
    const { provider } = buildProvider();
    await expect(provider.buildViewUrl(alertContext())).resolves.toBe(
      "https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/applications/payments-api"
    );
    await expect(provider.buildViewUrl(alertContext({ resourceId: "missing" }))).resolves.toBe(
      "https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/applications"
    );
    await expect(provider.buildViewUrl(alertContext({ resourceId: null }))).resolves.toBe(
      "https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/inventory"
    );
  });

  test("buildPayload for an alert with no application names Certificate Manager and lists each application", () => {
    const { provider } = buildProvider();
    const payload = provider.buildPayload(
      alertContext({ resourceId: null }),
      [sampleCertificate({ notAfter: futureDate(20) })],
      "https://app.infisical.com/view"
    );

    expect(payload.resourceOwnerKind).toBe("Certificate Manager");
    expect(payload.webhookSource).toBe("/alerts/alert-1");
    expect(payload.eventKey).toBe("cert-manager.certificate.expiry");
    expect(payload.webhookType).toBe("com.infisical.cert-manager.certificate.expiry");
    expect(payload.summary).toBe("1 certificate expiring within 30 days");
    expect(payload.items[0].fields).toContainEqual({ label: "Application", value: "payments-api" });
  });

  test("assertConditionInScope rejects filters on an application alert and unknown IDs", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertConditionInScope?.({
        projectId: "proj-1",
        condition: { applicationIds: [APPLICATION_ID], profileIds: [PROFILE_ID] }
      })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertConditionInScope?.({
        projectId: "proj-1",
        resourceId: APPLICATION_ID,
        condition: { alertBefore: "30d", profileIds: [PROFILE_ID] }
      })
    ).rejects.toThrow("Application alerts already cover a single application");
    await expect(
      provider.assertConditionInScope?.({ projectId: "proj-1", condition: { applicationIds: [OTHER_APPLICATION_ID] } })
    ).rejects.toThrow(`Application not found in Certificate Manager: '${OTHER_APPLICATION_ID}'`);
  });

  test("assertConditionInScope only checks IDs the update adds, so a deleted one can stay", async () => {
    const lookups: string[][] = [];
    const { provider } = buildProvider({ onFindApplicationIds: (ids) => lookups.push(ids) });
    await expect(
      provider.assertConditionInScope?.({
        projectId: "proj-1",
        condition: { applicationIds: [OTHER_APPLICATION_ID, APPLICATION_ID] },
        previousCondition: { applicationIds: [OTHER_APPLICATION_ID] }
      })
    ).resolves.toBeUndefined();
    expect(lookups).toEqual([[APPLICATION_ID]]);
  });

  test("lists each alert's filter IDs with their names, with a null name for IDs that no longer exist", async () => {
    const { provider } = buildProvider();
    const names = await provider.getFilters?.({
      orgId: "org-1",
      projectId: "proj-1",
      alerts: [
        {
          id: "alert-1",
          condition: { applicationIds: [APPLICATION_ID, OTHER_APPLICATION_ID], profileIds: [PROFILE_ID] }
        },
        { id: "alert-2", condition: null }
      ]
    });

    expect(names?.get("alert-1")).toEqual({
      applications: [
        { id: APPLICATION_ID, name: "payments-api" },
        { id: OTHER_APPLICATION_ID, name: null }
      ],
      profiles: [{ id: PROFILE_ID, name: "tls-server" }]
    });
    expect(names?.get("alert-2")).toEqual({ applications: [], profiles: [] });
  });

  test("an alert with no application logs Certificate Manager audit events naming its filters", () => {
    const { provider } = buildProvider();
    const alert = {
      id: "alert-1",
      name: "prod-expiry",
      resourceType: RESOURCE_TYPE,
      resourceId: null,
      eventType: EXPIRY_EVENT,
      condition: {
        alertBefore: "30d",
        applicationIds: [APPLICATION_ID, OTHER_APPLICATION_ID],
        profileIds: [PROFILE_ID]
      },
      filters: {
        applications: [{ id: APPLICATION_ID, name: "payments-api" }],
        profiles: [{ id: PROFILE_ID, name: "tls-server" }]
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

    expect(provider.getAuditEvent?.({ action: AlertAuditAction.Create, alert })).toEqual({
      type: "create-certificate-manager-alert",
      metadata
    });
    expect(provider.getAuditEvent?.({ action: AlertAuditAction.Delete, alert })).toEqual({
      type: "delete-certificate-manager-alert",
      metadata
    });
    expect(
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
    ).toMatchObject({
      type: "test-certificate-manager-alert-channel",
      metadata: { alertId: "alert-1", alertName: "prod-expiry", channelType: "email", success: true }
    });
  });

  test("assertPermission checks the application's resource permission when the alert is bound to one", async () => {
    const { provider, permissionService } = buildProvider();
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Read,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
        actor
      })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
        actor
      })
    ).rejects.toThrow();
    expect(permissionService.getResourcePermission).toHaveBeenCalled();
  });

  test("assertPermission requires a project", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", actor })
    ).rejects.toThrow("Certificate alerts must be created in Certificate Manager");
  });

  test("an alert with no application uses the project-level alerts permission", async () => {
    const { provider, permissionService } = buildProvider();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", projectId: "proj-1", actor })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Create, orgId: "org-1", projectId: "proj-1", actor })
    ).rejects.toThrow();
    expect(permissionService.getProjectPermission).toHaveBeenCalled();
    expect(permissionService.getResourcePermission).not.toHaveBeenCalled();
  });

  test("creating or editing an alert with no application requires reading every certificate", async () => {
    const create = { action: AlertPermissionAction.Create, orgId: "org-1", projectId: "proj-1", actor };
    const alertRules = [
      { action: "create", subject: "pki-alerts" },
      { action: "edit", subject: "pki-alerts" }
    ];

    await expect(
      buildProvider({
        abilityRules: [...alertRules, { action: "read", subject: "certificates" }]
      }).provider.assertPermission(create)
    ).resolves.toBeUndefined();
    await expect(buildProvider({ abilityRules: alertRules }).provider.assertPermission(create)).rejects.toThrow(
      "require permission to read all certificates"
    );
    await expect(
      buildProvider({
        abilityRules: [
          ...alertRules,
          { action: "read", subject: "certificates", conditions: { commonName: { $glob: "*.internal" } } }
        ]
      }).provider.assertPermission({ ...create, action: AlertPermissionAction.Edit })
    ).rejects.toThrow("require permission to read all certificates");
    await expect(
      buildProvider({
        abilityRules: [
          ...alertRules,
          { action: "read", subject: "certificates" },
          { action: "read", subject: "certificates", inverted: true, conditions: { commonName: { $glob: "*.prod" } } }
        ]
      }).provider.assertPermission(create)
    ).rejects.toThrow("require permission to read all certificates");
  });

  test("assertResourceInScope rejects an application from another project or org", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertResourceInScope({
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90"
      })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertResourceInScope({
        orgId: "org-1",
        projectId: "proj-2",
        resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90"
      })
    ).rejects.toThrow("Application with ID '7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90' not found in Certificate Manager");
    await expect(
      provider.assertResourceInScope({
        orgId: "org-2",
        projectId: "proj-1",
        resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90"
      })
    ).rejects.toThrow();
    await expect(provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1" })).resolves.toBeUndefined();
  });

  test("resolveProjectId returns the application's project and hides applications from other orgs", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.resolveProjectId?.({ orgId: "org-1", resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90" })
    ).resolves.toBe("proj-1");
    await expect(
      provider.resolveProjectId?.({ orgId: "org-2", resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90" })
    ).rejects.toThrow("Application with ID '7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90' not found");
  });

  test("resolveProjectId falls back to the org's Certificate Manager project without an application", async () => {
    const { provider } = buildProvider();
    await expect(provider.resolveProjectId?.({ orgId: "org-1" })).resolves.toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2" })).rejects.toThrow(
      "Certificate Manager isn't set up for this organization"
    );
  });

  test("rejects a malformed application ID with a bad request before any lookup", async () => {
    const { provider, permissionService } = buildProvider();
    const expected = "Invalid application ID 'not-a-uuid': must be a UUID";
    await expect(
      provider.assertPermission({
        action: AlertPermissionAction.Read,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "not-a-uuid",
        actor
      })
    ).rejects.toThrow(expected);
    await expect(
      provider.assertResourceInScope({ orgId: "org-1", projectId: "proj-1", resourceId: "not-a-uuid" })
    ).rejects.toThrow(expected);
    await expect(provider.resolveProjectId?.({ orgId: "org-1", resourceId: "not-a-uuid" })).rejects.toThrow(expected);
    expect(permissionService.getResourcePermission).not.toHaveBeenCalled();
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
    const names = await provider.getResourceNames?.({
      orgId: "org-1",
      resourceIds: ["7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90"]
    });
    expect(lookup).toEqual({ ids: ["7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90"], orgId: "org-1" });
    expect(names?.get("7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90")).toBe("payments-api");
    const foreign = await provider.getResourceNames?.({
      orgId: "org-2",
      resourceIds: ["7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90"]
    });
    expect(foreign?.size).toBe(0);
  });

  test("telemetry reports the same alertType values as the deprecated application routes", () => {
    const { provider } = buildProvider();
    expect(
      provider.getTelemetryEvent?.({
        action: AlertTelemetryAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
        eventType: EXPIRY_EVENT
      })
    ).toEqual({
      event: PostHogEventTypes.PkiAlertCreated,
      properties: {
        orgId: "org-1",
        projectId: "proj-1",
        applicationId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
        alertScope: PkiAlertScope.Application,
        alertType: "expiration"
      }
    });
    expect(
      provider.getTelemetryEvent?.({
        action: AlertTelemetryAction.Delete,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90",
        eventType: ISSUANCE_EVENT
      })?.event
    ).toBe(PostHogEventTypes.PkiAlertDeleted);
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

  describe("signer certificate expiration", () => {
    const signerCertificate = sampleCertificate({
      id: "cert-signer",
      commonName: "release signing",
      altNames: null,
      applicationId: null,
      applicationName: null,
      signerIds: ["signer-1"],
      signerNames: ["release-signer"]
    });
    const signerAlert = alertContext({
      resourceId: null,
      eventType: SIGNER_EXPIRY_EVENT,
      condition: { alertBefore: "30d" }
    });

    test("is a scheduled event that takes only alertBefore and dailyReminder", () => {
      const event = buildProvider().provider.events.find((candidate) => candidate.key === SIGNER_EXPIRY_EVENT)!;
      expect(event.triggerType).toBe("scheduled");
      expect(event.conditionSchema.safeParse({ alertBefore: "30d", dailyReminder: true }).success).toBe(true);
      expect(event.conditionSchema.safeParse({ alertBefore: "30d", applicationIds: [APPLICATION_ID] }).success).toBe(
        false
      );
      expect(event.conditionSchema.safeParse({ alertBefore: "400d" }).success).toBe(false);
    });

    test("scans the active certificate of every signer and never an application", async () => {
      let signerArgs: Record<string, unknown> | undefined;
      let certificateScan = false;
      const { provider } = buildProvider({
        certificates: [signerCertificate],
        onFindExpiringSigners: (args) => {
          signerArgs = args;
        },
        onFindExpiring: () => {
          certificateScan = true;
        }
      });
      const asOf = new Date("2026-10-01T00:00:00.000Z");

      const targets = await provider.findScheduledTargets({
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: null,
        eventType: SIGNER_EXPIRY_EVENT,
        condition: { alertBefore: "2w" },
        asOf
      });

      expect(targets).toEqual([signerCertificate]);
      expect(certificateScan).toBe(false);
      expect(signerArgs).toMatchObject({ projectId: "proj-1", alertBeforeInterval: "14 days", asOf });
      await expect(
        provider.findScheduledTargets({
          orgId: "org-1",
          projectId: "proj-1",
          resourceId: APPLICATION_ID,
          eventType: SIGNER_EXPIRY_EVENT,
          condition: { alertBefore: "2w" },
          asOf
        })
      ).resolves.toEqual([]);
    });

    test("creating or editing one requires a project admin and refuses an application", async () => {
      const create = {
        action: AlertPermissionAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        eventType: SIGNER_EXPIRY_EVENT,
        actor
      };
      const alertRules = [
        { action: "create", subject: "pki-alerts" },
        { action: "edit", subject: "pki-alerts" },
        { action: "read", subject: "pki-alerts" }
      ];

      await expect(
        buildProvider({ abilityRules: alertRules, projectRoles: ["admin"] }).provider.assertPermission(create)
      ).resolves.toBeUndefined();
      await expect(
        buildProvider({
          abilityRules: [...alertRules, { action: "read", subject: "code-signers" }],
          projectRoles: ["member"]
        }).provider.assertPermission(create)
      ).rejects.toThrow("only Certificate Manager admins");
      await expect(
        buildProvider({
          abilityRules: [...alertRules, { action: "read", subject: "code-signers" }]
        }).provider.assertPermission({ ...create, action: AlertPermissionAction.Edit })
      ).rejects.toThrow("only Certificate Manager admins");
      await expect(
        buildProvider({ abilityRules: alertRules }).provider.assertPermission({
          ...create,
          action: AlertPermissionAction.Read
        })
      ).resolves.toBeUndefined();
      await expect(
        buildProvider({ abilityRules: alertRules, projectRoles: ["admin"] }).provider.assertPermission({
          ...create,
          resourceId: APPLICATION_ID
        })
      ).rejects.toThrow("can't be bound to an application");
    });

    test("buildPayload names the signer and links to Code Signing", async () => {
      const { provider } = buildProvider();
      const viewUrl = await provider.buildViewUrl(signerAlert);
      const payload = provider.buildPayload(signerAlert, [signerCertificate], viewUrl);

      expect(viewUrl).toBe("https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/code-signing");
      expect(payload.resourceKind).toBe("Signer Certificate");
      expect(payload.eventKey).toBe("cert-manager.signer-certificate.expiry");
      expect(payload.webhookType).toBe("com.infisical.cert-manager.signer-certificate.expiry");
      expect(payload.eventLabel).toBe("Expiration");
      expect(payload.resourceOwnerKind).toBe("Certificate Manager");
      expect(payload.summary).toBe("1 signer certificate expiring within 30 days");
      expect(payload.items[0].summary).toMatch(/^Certificate 'release signing' of signer 'release-signer' expires on /);
      expect(payload.items[0].fields?.[0]).toEqual({ label: "Signer", value: "release-signer" });
      expect(payload.items[0].resource).toMatchObject({ signerIds: ["signer-1"], signerNames: ["release-signer"] });
      expect(provider.dedupWindowHours?.({ alertBefore: "30d" })).toBe(44);
    });

    test("a certificate shared by several signers is one item naming every signer", async () => {
      const { provider } = buildProvider();
      const sharedCertificate = {
        ...signerCertificate,
        signerIds: ["signer-1", "signer-2"],
        signerNames: ["build-signer", "release-signer"]
      };
      const payload = provider.buildPayload(signerAlert, [sharedCertificate], await provider.buildViewUrl(signerAlert));

      expect(payload.items).toHaveLength(1);
      expect(payload.items[0].summary).toMatch(
        /^Certificate 'release signing' of signers 'build-signer', 'release-signer' expires on /
      );
      expect(payload.items[0].fields?.[0]).toEqual({ label: "Signers", value: "build-signer, release-signer" });
    });
  });
});
