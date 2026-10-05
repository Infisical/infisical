import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType } from "../alert-channel-types";
import { AlertAuditAction, AlertPermissionAction, AlertTelemetryAction, TAlertContext } from "../alert-types";
import { TSignerAlertCertificate } from "./cert-manager-signer-alert-dal";
import {
  certManagerSignerAlertProviderFactory,
  TCertManagerSignerAlertProviderDep
} from "./cert-manager-signer-alert-provider";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com" })
}));

const RESOURCE_TYPE = "cert-manager.signer";
const EXPIRY_EVENT = "cert-manager.signer.certificate.expiry";
const APPLICATION_ID = "7b0a6b54-3c1e-4f3a-9d5e-2f1b8c4d6e90";

const NOT_AFTER = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

const signerCertificate = (overrides: Partial<TSignerAlertCertificate> = {}): TSignerAlertCertificate => ({
  id: "cert-signer",
  serialNumber: "0a1b2c",
  commonName: "release signing",
  altNames: null,
  status: "active",
  notBefore: new Date("2026-01-01T00:00:00.000Z"),
  notAfter: NOT_AFTER,
  signerIds: ["signer-1"],
  signerNames: ["release-signer"],
  ...overrides
});

const signerAlert: TAlertContext = {
  id: "alert-1",
  name: "signer-expiry",
  orgId: "org-1",
  projectId: "proj-1",
  resourceType: RESOURCE_TYPE,
  resourceId: null,
  eventType: EXPIRY_EVENT,
  condition: { alertBefore: "30d" }
};

const alreadyAlerted = { alertId: "alert-1", channelIds: ["channel-1"], since: new Date() };

const actor = { actor: "user", actorId: "u1", actorAuthMethod: null, actorOrgId: "org-1" } as never;

const alertRules = [
  { action: "create", subject: "pki-alerts" },
  { action: "edit", subject: "pki-alerts" },
  { action: "read", subject: "pki-alerts" }
];

const buildProvider = (opts?: {
  certificates?: TSignerAlertCertificate[];
  onFindExpiring?: (args: Record<string, unknown>) => void;
  abilityRules?: { action: string; subject: string }[];
  projectRoles?: string[];
  pkiEnterpriseAlerting?: boolean;
}) =>
  certManagerSignerAlertProviderFactory({
    certManagerSignerAlertDAL: {
      findExpiringSignerCertificates: async (args: Record<string, unknown>) => {
        opts?.onFindExpiring?.(args);
        return opts?.certificates ?? [];
      }
    },
    permissionService: {
      getProjectPermission: async () => ({
        permission: createMongoAbility((opts?.abilityRules ?? alertRules) as never),
        hasRole: (role: string) => (opts?.projectRoles ?? []).includes(role)
      })
    },
    licenseService: { getPlan: async () => ({ pkiEnterpriseAlerting: opts?.pkiEnterpriseAlerting ?? false }) },
    certManagerProjectResolver: { getActiveProjectId: async (orgId: string) => (orgId === "org-1" ? "proj-1" : null) }
  } as unknown as TCertManagerSignerAlertProviderDep);

describe("cert manager signer alert provider", () => {
  test("owns one scheduled event that takes only alertBefore and dailyReminder", () => {
    const provider = buildProvider();
    expect(provider.resourceType).toBe(RESOURCE_TYPE);
    expect(provider.events.map((event) => event.key)).toEqual([EXPIRY_EVENT]);

    const [event] = provider.events;
    expect(event.triggerType).toBe("scheduled");
    expect(event.conditionSchema.safeParse({ alertBefore: "30d", dailyReminder: true }).success).toBe(true);
    expect(event.conditionSchema.safeParse({ alertBefore: "30d", applicationIds: [APPLICATION_ID] }).success).toBe(
      false
    );
    expect(event.conditionSchema.safeParse({ alertBefore: "400d" }).success).toBe(false);
  });

  test("scans every active signer's certificate, and nothing for a bound alert or one with no channels", async () => {
    let scanArgs: Record<string, unknown> | undefined;
    const provider = buildProvider({
      certificates: [signerCertificate()],
      onFindExpiring: (args) => {
        scanArgs = args;
      }
    });
    const asOf = new Date("2026-10-01T00:00:00.000Z");
    const input = {
      orgId: "org-1",
      projectId: "proj-1",
      resourceId: null,
      eventType: EXPIRY_EVENT,
      condition: { alertBefore: "2w" },
      asOf,
      alreadyAlerted
    };

    await expect(provider.findScheduledTargets(input)).resolves.toEqual([signerCertificate()]);
    expect(scanArgs).toMatchObject({ projectId: "proj-1", alertBeforeInterval: "14 days", asOf, alreadyAlerted });
    await expect(provider.findScheduledTargets({ ...input, resourceId: APPLICATION_ID })).resolves.toEqual([]);
    await expect(
      provider.findScheduledTargets({ ...input, alreadyAlerted: { ...alreadyAlerted, channelIds: [] } })
    ).resolves.toEqual([]);
  });

  test("creating or editing one requires a project admin, reading and deleting only PKI alert access", async () => {
    const create = { action: AlertPermissionAction.Create, orgId: "org-1", projectId: "proj-1", actor };

    await expect(buildProvider({ projectRoles: ["admin"] }).assertPermission(create)).resolves.toBeUndefined();
    await expect(
      buildProvider({
        abilityRules: [...alertRules, { action: "read", subject: "code-signers" }],
        projectRoles: ["member"]
      }).assertPermission(create)
    ).rejects.toThrow("only Certificate Manager admins");
    await expect(buildProvider().assertPermission({ ...create, action: AlertPermissionAction.Edit })).rejects.toThrow(
      "only Certificate Manager admins"
    );
    await expect(
      buildProvider().assertPermission({ ...create, action: AlertPermissionAction.Read })
    ).resolves.toBeUndefined();
    await expect(
      buildProvider({ abilityRules: [], projectRoles: ["admin"] }).assertPermission(create)
    ).rejects.toThrow();
  });

  test("refuses a resource everywhere a caller can name one", async () => {
    const provider = buildProvider({ projectRoles: ["admin"] });
    const bound = { action: AlertPermissionAction.Create, orgId: "org-1", projectId: "proj-1", actor };

    await expect(provider.assertPermission({ ...bound, resourceId: APPLICATION_ID })).rejects.toThrow(
      "can't be bound to a resource"
    );
    await expect(provider.assertResourceInScope({ orgId: "org-1", resourceId: APPLICATION_ID })).rejects.toThrow(
      "can't be bound to a resource"
    );
    await expect(provider.resolveProjectId?.({ orgId: "org-1", resourceId: APPLICATION_ID })).rejects.toThrow(
      "can't be bound to a resource"
    );
    await expect(provider.resolveProjectId?.({ orgId: "org-1" })).resolves.toBe("proj-1");
    await expect(provider.resolveProjectId?.({ orgId: "org-2" })).rejects.toThrow("Certificate Manager isn't set up");
  });

  test("buildPayload names the signer, links to Code Signing, and delivers under its own key", async () => {
    const provider = buildProvider();
    const viewUrl = await provider.buildViewUrl(signerAlert);
    const payload = provider.buildPayload(signerAlert, [signerCertificate()], viewUrl);

    expect(viewUrl).toBe("https://app.infisical.com/organizations/org-1/projects/cert-manager/proj-1/code-signing");
    expect(payload.eventKey).toBe(EXPIRY_EVENT);
    expect(payload.webhookType).toBe(`com.infisical.${EXPIRY_EVENT}`);
    expect(payload.webhookSource).toBe("/alerts/alert-1");
    expect(payload.resourceKind).toBe("Signer Certificate");
    expect(payload.resourceOwnerKind).toBe("Certificate Manager");
    expect(payload.eventLabel).toBe("Expiration");
    expect(payload.summary).toBe("1 signer certificate expiring within 30 days");
    expect(payload.items[0].summary).toMatch(/^Certificate 'release signing' of signer 'release-signer' expires on /);
    expect(payload.items[0].fields?.[0]).toEqual({ label: "Signer", value: "release-signer" });
    expect(payload.items[0].resource).toMatchObject({ signerIds: ["signer-1"], signerNames: ["release-signer"] });
    expect(provider.dedupWindowHours?.({ alertBefore: "30d" })).toBe(44);
    expect(provider.dedupWindowHours?.({ alertBefore: "30d", dailyReminder: true })).toBe(20);
  });

  test("a certificate shared by several signers is one item naming every signer", () => {
    const payload = buildProvider().buildPayload(
      signerAlert,
      [signerCertificate({ signerIds: ["signer-1", "signer-2"], signerNames: ["build-signer", "release-signer"] })],
      "https://example.com"
    );

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].summary).toMatch(
      /^Certificate 'release signing' of signers 'build-signer', 'release-signer' expires on /
    );
    expect(payload.items[0].fields?.[0]).toEqual({ label: "Signers", value: "build-signer, release-signer" });
  });

  test("logs Certificate Manager alert audit events and PKI alert telemetry", () => {
    const provider = buildProvider();
    const alert = { ...signerAlert, enabled: true, channels: [] } as never;

    expect(provider.getAuditEvent?.({ action: AlertAuditAction.Create, alert })).toEqual({
      type: EventType.CREATE_CERTIFICATE_MANAGER_ALERT,
      metadata: {
        alertId: "alert-1",
        name: "signer-expiry",
        eventType: EXPIRY_EVENT,
        applications: [],
        profiles: [],
        sources: []
      }
    });
    expect(
      provider.getTelemetryEvent?.({
        action: AlertTelemetryAction.Create,
        orgId: "org-1",
        projectId: "proj-1",
        resourceId: null,
        eventType: EXPIRY_EVENT
      })
    ).toEqual({
      event: PostHogEventTypes.PkiAlertCreated,
      properties: {
        orgId: "org-1",
        projectId: "proj-1",
        alertScope: PkiAlertScope.CertificateManager,
        alertType: "signer-certificate-expiration"
      }
    });
  });

  test("gates channels other than email on the enterprise alerting plan", async () => {
    await expect(
      buildProvider().assertChannelTypesAllowed?.({ orgId: "org-1", channelTypes: [AlertChannelType.WEBHOOK] })
    ).rejects.toThrow("plan restriction");
    await expect(
      buildProvider().assertChannelTypesAllowed?.({ orgId: "org-1", channelTypes: [AlertChannelType.EMAIL] })
    ).resolves.toBeUndefined();
    await expect(
      buildProvider({ pkiEnterpriseAlerting: true }).assertChannelTypesAllowed?.({
        orgId: "org-1",
        channelTypes: [AlertChannelType.WEBHOOK]
      })
    ).resolves.toBeUndefined();
  });
});
