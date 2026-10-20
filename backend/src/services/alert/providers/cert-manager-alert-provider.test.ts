import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType } from "../alert-channel-types";
import { AlertPermissionAction, AlertTelemetryAction, TAlertContext } from "../alert-types";
import { certManagerAlertProviderFactory, TCertManagerAlertProviderDep } from "./cert-manager-alert-provider";
import { TAlertCertificate } from "./cert-manager-certificate-alert-dal";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const RESOURCE_TYPE = "cert-manager";
const EXPIRY_EVENT = "cert-manager.certificate.expiry";
const ISSUANCE_EVENT = "cert-manager.certificate.issuance";
const REVOCATION_EVENT = "cert-manager.certificate.revocation";
const APPLICATION_ID = "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90";
const OTHER_APPLICATION_ID = "6c8e4a1f-9b2d-4f3c-8e7a-2b3c4d5e6f70";
const PROFILE_ID = "7d9f5b2a-0c3e-4a4d-9f8b-3c4d5e6f7081";

const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const sampleCertificate = (overrides: Partial<TAlertCertificate> = {}): TAlertCertificate => ({
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
  resourceId: null,
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
  onFindApplicationIds?: (ids: string[]) => void;
  abilityRules?: { action: string; subject: string }[];
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
    getProjectPermission: vi.fn(async () => ({
      permission: ability(),
      hasRole: (role: string) => (opts?.projectRoles ?? []).includes(role)
    }))
  };
  const licenseService = {
    getPlan: async () => ({ pkiEnterpriseAlerting: opts?.pkiEnterpriseAlerting ?? false })
  };
  const provider = certManagerAlertProviderFactory({
    certManagerCertificateAlertDAL: dal,
    permissionService,
    licenseService,
    certManagerProjectResolver: {
      getActiveProjectId: async (orgId: string) => (orgId === "org-1" ? "proj-1" : null)
    }
  } as unknown as TCertManagerAlertProviderDep);
  return { provider, permissionService };
};

const actor = { actor: "user", actorId: "u1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

const expiryConditionSchema = (provider: ReturnType<typeof buildProvider>["provider"]) =>
  provider.events.find((event) => event.key === EXPIRY_EVENT)!.conditionSchema;

describe("cert manager alert provider", () => {
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

  test("issuance, renewal and revocation are sourced from the application events and take only optional filters", () => {
    const { provider } = buildProvider();
    expect(provider.resourceType).toBe("cert-manager");
    expect(provider.supportsScopeWideAlerts).toBe(true);
    const eventTriggered = provider.events.filter((event) => event.triggerType === "event");
    expect(eventTriggered.map((event) => [event.key, event.sourceEvent])).toEqual([
      [
        ISSUANCE_EVENT,
        { resourceType: "cert-manager.application", eventKey: "cert-manager.application.certificate.issuance" }
      ],
      [
        "cert-manager.certificate.renewal",
        { resourceType: "cert-manager.application", eventKey: "cert-manager.application.certificate.renewal" }
      ],
      [
        REVOCATION_EVENT,
        { resourceType: "cert-manager.application", eventKey: "cert-manager.application.certificate.revocation" }
      ]
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

  test("the source filter takes issued, imported or discovered, each once", () => {
    const schema = expiryConditionSchema(buildProvider().provider);
    expect(schema.safeParse({ alertBefore: "30d", sources: ["imported", "discovered"] }).success).toBe(true);
    expect(schema.safeParse({ alertBefore: "30d", sources: ["issued"] }).success).toBe(true);
    expect(schema.safeParse({ alertBefore: "30d", sources: [] }).success).toBe(false);
    expect(schema.safeParse({ alertBefore: "30d", sources: ["external"] }).success).toBe(false);
    const duplicated = schema.safeParse({ alertBefore: "30d", sources: ["imported", "imported"] });
    expect(duplicated.error?.issues[0].message).toBe("sources lists the same source more than once");
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

  test("findScheduledTargets scans nothing when the alert has no channel to deliver to", async () => {
    let scanned = false;
    const { provider } = buildProvider({
      onFindExpiring: () => {
        scanned = true;
      }
    });

    const targets = await provider.findScheduledTargets({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: null,
      eventType: EXPIRY_EVENT,
      condition: { alertBefore: "2w" },
      asOf: new Date(),
      alreadyAlerted: { alertId: "alert-1", channelIds: [], since: new Date() }
    });

    expect(targets).toEqual([]);
    expect(scanned).toBe(false);
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
      condition: { alertBefore: "2w", profileIds: [PROFILE_ID], sources: ["imported"] },
      asOf: new Date(),
      alreadyAlerted: { alertId: "alert-1", channelIds: ["channel-1"], since: new Date() }
    });
    await provider.findEventTargets({
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: null,
      eventType: ISSUANCE_EVENT,
      condition: { applicationIds: [APPLICATION_ID], sources: ["issued", "discovered"] },
      targetIds: ["cert-1"]
    } as never);

    expect(scheduledArgs).toMatchObject({
      projectId: "proj-1",
      profileIds: [PROFILE_ID],
      sources: ["imported"],
      alertBeforeInterval: "14 days"
    });
    expect(scheduledArgs?.applicationId).toBeUndefined();
    expect(eventArgs).toMatchObject({
      projectId: "proj-1",
      applicationIds: [APPLICATION_ID],
      sources: ["issued", "discovered"],
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

  test("buildPayload for an alert with no application names Certificate Manager and lists each application", () => {
    const { provider } = buildProvider();
    const payload = provider.buildPayload(
      alertContext({ resourceId: null }),
      [sampleCertificate({ notAfter: futureDate(20) })],
      "https://app.infisical.com/view"
    );

    expect(payload.resourceOwnerKind).toBe("Certificate Manager");
    expect(payload.alert.resourceType).toBe("cert-manager");
    expect(payload.alert).not.toHaveProperty("resourceId");
    expect(payload.webhookSource).toBe("/alerts/alert-1");
    expect(payload.eventKey).toBe("cert-manager.certificate.expiry");
    expect(payload.webhookType).toBe("com.infisical.cert-manager.certificate.expiry");
    expect(payload.summary).toBe("1 certificate expiring within 30 days");
    expect(payload.items[0].fields).toContainEqual({ label: "Application", value: "payments-api" });
  });

  test("assertConditionInScope accepts known filter IDs and rejects unknown ones", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertConditionInScope?.({
        projectId: "proj-1",
        condition: { applicationIds: [APPLICATION_ID], profileIds: [PROFILE_ID] }
      })
    ).resolves.toBeUndefined();
    await expect(
      provider.assertConditionInScope?.({ projectId: "proj-1", condition: { applicationIds: [OTHER_APPLICATION_ID] } })
    ).rejects.toThrow(`Application not found in Certificate Manager: '${OTHER_APPLICATION_ID}'`);
  });

  test("refuses a resource everywhere a caller can name one", async () => {
    const { provider } = buildProvider({
      abilityRules: [{ action: "create", subject: "pki-alerts" }],
      projectRoles: ["admin"]
    });
    const create = { action: AlertPermissionAction.Create, orgId: "org-1", projectId: "proj-1", actor };
    await expect(provider.assertPermission({ ...create, resourceId: APPLICATION_ID })).rejects.toThrow(
      "aren't bound to a single application"
    );
    await expect(provider.assertResourceInScope({ orgId: "org-1", resourceId: APPLICATION_ID })).rejects.toThrow(
      "aren't bound to a single application"
    );
    await expect(provider.resolveProjectId?.({ orgId: "org-1", resourceId: APPLICATION_ID })).rejects.toThrow(
      "aren't bound to a single application"
    );
  });

  test("delivers under its own resource type and keys, links to the inventory and sources from the alert", async () => {
    const { provider } = buildProvider();
    const alert = alertContext({ eventType: ISSUANCE_EVENT, condition: null });
    const viewUrl = await provider.buildViewUrl(alert);
    const payload = provider.buildPayload(alert, [sampleCertificate()], viewUrl);

    expect(viewUrl).toBe("https://app.infisical.com/organizations/org-1/cert-manager/inventory");
    expect(payload.alert.resourceType).toBe("cert-manager");
    expect(payload.alert).not.toHaveProperty("resourceId");
    expect(payload.eventKey).toBe(ISSUANCE_EVENT);
    expect(payload.webhookType).toBe(`com.infisical.${ISSUANCE_EVENT}`);
    expect(payload.webhookSource).toBe("/alerts/alert-1");
    expect(payload.eventLabel).toBe("Issuance");
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

  test("assertPermission requires a project", async () => {
    const { provider } = buildProvider();
    await expect(
      provider.assertPermission({ action: AlertPermissionAction.Read, orgId: "org-1", actor })
    ).rejects.toThrow("Certificate alerts must be created in Certificate Manager");
  });

  test("creating or editing an alert with no application requires a project admin, reading and deleting only PKI alert access", async () => {
    const create = { action: AlertPermissionAction.Create, orgId: "org-1", projectId: "proj-1", actor };
    const alertRules = [
      { action: "read", subject: "pki-alerts" },
      { action: "create", subject: "pki-alerts" },
      { action: "edit", subject: "pki-alerts" },
      { action: "delete", subject: "pki-alerts" }
    ];
    const admin = buildProvider({ abilityRules: alertRules, projectRoles: ["admin"] }).provider;
    const member = buildProvider({
      abilityRules: [...alertRules, { action: "read", subject: "certificates" }],
      projectRoles: ["member"]
    }).provider;

    await expect(admin.assertPermission(create)).resolves.toBeUndefined();
    await expect(admin.assertPermission({ ...create, action: AlertPermissionAction.Edit })).resolves.toBeUndefined();
    await expect(member.assertPermission(create)).rejects.toThrow("only Certificate Manager admins");
    await expect(member.assertPermission({ ...create, action: AlertPermissionAction.Edit })).rejects.toThrow(
      "only Certificate Manager admins"
    );
    await expect(member.assertPermission({ ...create, action: AlertPermissionAction.Read })).resolves.toBeUndefined();
    await expect(member.assertPermission({ ...create, action: AlertPermissionAction.Delete })).resolves.toBeUndefined();
    await expect(
      buildProvider({ abilityRules: [], projectRoles: ["admin"] }).provider.assertPermission(create)
    ).rejects.toThrow();
  });

  test("resolveProjectId falls back to the org's Certificate Manager project without an application", async () => {
    const { provider } = buildProvider();
    await expect(provider.resolveProjectId?.({ orgId: "org-1" })).resolves.toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2" })).rejects.toThrow(
      "Certificate Manager isn't set up for this organization"
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

  test("telemetry reports Certificate Manager scope with the shared alertType values", () => {
    const { provider } = buildProvider();
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
    expect(
      provider.getTelemetryEvent?.({
        action: AlertTelemetryAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: null,
        eventType: EXPIRY_EVENT
      })?.properties
    ).toMatchObject({ alertType: "expiration" });
  });
});
