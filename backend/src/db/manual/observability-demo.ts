import { Knex } from "knex";

import {
  MetricType,
  ObservabilityItemStatus,
  ObservabilityResourceType,
  ObservabilityWidgetType
} from "../../services/observability-widget/observability-widget-types";
import { AccessScope, IdentityAuthMethod, OrgMembershipRole, OrgMembershipStatus, TableName } from "../schemas";
import { seedData1 } from "../seed-data";

const OBS_MACHINE_IDENTITY_ID = "ba7f0f6a-03d2-4d3a-a8e7-95d777a426c1";
const OBS_APP_CONNECTION_ID = "d2af5d2b-15cb-409e-ae96-fd3f1f5af8e1";

const OBS_IDENTITY_TOKEN_EXPIRED_ID = "obs-iat-expired";
const OBS_IDENTITY_TOKEN_PENDING_ID = "obs-iat-pending";
const OBS_IDENTITY_TOKEN_ACTIVE_ID = "obs-iat-active";

const OBS_SERVICE_TOKEN_EXPIRED_ID = "obs-st-expired";
const OBS_SERVICE_TOKEN_PENDING_ID = "obs-st-pending";
const OBS_SERVICE_TOKEN_ACTIVE_ID = "obs-st-active";

const OBS_WEBHOOK_FAILED_ID = "62f259b3-b029-4944-bea1-a1bf7e02d184";
const OBS_WEBHOOK_ACTIVE_ID = "470746f1-d311-41c9-bc17-cf22b31ec32e";

const OBS_SECRET_SYNC_FAILED_ID = "f9fd42f7-5a48-472f-b26e-85b1d4ec96d4";
const OBS_SECRET_SYNC_PENDING_ID = "014b2012-9d4f-49ba-a9a3-ae7d4ccdb77e";
const OBS_SECRET_SYNC_ACTIVE_ID = "8f08dd8c-f900-4316-af3e-2e61f4c2449c";

const OBS_CERT_EXPIRING_SOON_ID = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d";
const OBS_CERT_EXPIRING_SOON_2_ID = "b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e";

const log = (msg: string) => {
  // eslint-disable-next-line no-console
  console.log(`[observability-demo] ${msg}`);
};

export const seedObservabilityDemo = async (
  knex: Knex,
  orgId = seedData1.organization.id,
  userEmail?: string
): Promise<void> => {
  log(`Starting for org ${orgId}${userEmail ? ` (user: ${userEmail})` : ""}`);

  const org = await knex(TableName.Organization).where({ id: orgId }).first();
  if (!org) {
    const hint =
      orgId === seedData1.organization.id
        ? " Run `npm run seed-dev` first to create the default org, project, and user."
        : "";
    throw new Error(`Organization ${orgId} not found.${hint}`);
  }
  log(`Found org: ${org.name} (${org.slug})`);

  let user: { id: string } | undefined;
  if (userEmail) {
    user = await knex(TableName.Users).where({ email: userEmail }).first();
  }
  if (!user) {
    user = await knex(TableName.Users).where({ id: seedData1.id }).orWhere({ email: seedData1.email }).first();
  }
  if (!user) {
    const orgMember = await knex(TableName.Membership)
      .where({ scope: AccessScope.Organization, scopeOrgId: org.id })
      .whereNotNull("actorUserId")
      .first();
    if (!orgMember?.actorUserId) {
      throw new Error("No user found. Add a user to the org first, or run standard seeds (1-user, 2-org).");
    }
    user = await knex(TableName.Users).where({ id: orgMember.actorUserId }).first();
  }
  if (!user) throw new Error("User not found");
  log(`Using user: ${user.id}`);

  let membership = await knex(TableName.Membership)
    .where({
      scope: AccessScope.Organization,
      scopeOrgId: org.id,
      actorUserId: user.id
    })
    .first();

  if (!membership) {
    [membership] = await knex(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: org.id,
        actorUserId: user.id,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      })
      .returning("*");
  }

  const adminRole = await knex(TableName.MembershipRole)
    .where({
      membershipId: membership.id,
      role: OrgMembershipRole.Admin
    })
    .first();

  if (!adminRole) {
    await knex(TableName.MembershipRole).insert({
      membershipId: membership.id,
      role: OrgMembershipRole.Admin
    });
  }

  const project = await knex(TableName.Project).where({ orgId: org.id }).orderBy("createdAt", "asc").first();
  if (!project) {
    throw new Error(`No project found for org ${org.id}. Run project seed before observability seed.`);
  }
  log(`Using project: ${project.name}`);

  let environment = await knex(TableName.Environment)
    .where({ projectId: project.id })
    .orderBy("position", "asc")
    .first();
  if (!environment) {
    [environment] = await knex(TableName.Environment)
      .insert({
        name: "Development",
        slug: "dev",
        projectId: project.id,
        position: 1
      })
      .returning("*");
  }
  log(`Using environment: ${environment.slug}`);

  log("Seeding machine identity...");
  await knex(TableName.Identity)
    .insert({
      // eslint-disable-next-line
      // @ts-ignore
      id: OBS_MACHINE_IDENTITY_ID,
      name: "obs-seed-machine",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: org.id
    })
    .onConflict("id")
    .merge({
      name: "obs-seed-machine",
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      orgId: org.id
    });

  let identityOrgMembership = await knex(TableName.Membership)
    .where({
      scope: AccessScope.Organization,
      scopeOrgId: org.id,
      actorIdentityId: OBS_MACHINE_IDENTITY_ID
    })
    .first();

  if (!identityOrgMembership) {
    [identityOrgMembership] = await knex(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: org.id,
        actorIdentityId: OBS_MACHINE_IDENTITY_ID,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      })
      .returning("*");
  }

  const identityAdminRole = await knex(TableName.MembershipRole)
    .where({
      membershipId: identityOrgMembership.id,
      role: OrgMembershipRole.Admin
    })
    .first();

  if (!identityAdminRole) {
    await knex(TableName.MembershipRole).insert({
      membershipId: identityOrgMembership.id,
      role: OrgMembershipRole.Admin
    });
  }

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  log("Seeding identity access tokens (expired/pending/active)...");
  await knex(TableName.IdentityAccessToken)
    .insert([
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_IDENTITY_TOKEN_EXPIRED_ID,
        identityId: OBS_MACHINE_IDENTITY_ID,
        name: "obs-identity-token-expired",
        authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
        accessTokenTTL: 60 * 60 * 24 * 7,
        accessTokenMaxTTL: 60 * 60 * 24 * 7,
        accessTokenNumUses: 20,
        accessTokenNumUsesLimit: 0,
        accessTokenLastUsedAt: days(-2),
        isAccessTokenRevoked: false,
        createdAt: days(-30),
        updatedAt: now
      },
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_IDENTITY_TOKEN_PENDING_ID,
        identityId: OBS_MACHINE_IDENTITY_ID,
        name: "obs-identity-token-expiring-soon",
        authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
        accessTokenTTL: 60 * 60 * 24 * 2,
        accessTokenMaxTTL: 60 * 60 * 24 * 2,
        accessTokenNumUses: 8,
        accessTokenNumUsesLimit: 0,
        accessTokenLastUsedAt: now,
        isAccessTokenRevoked: false,
        createdAt: now,
        updatedAt: now
      },
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_IDENTITY_TOKEN_ACTIVE_ID,
        identityId: OBS_MACHINE_IDENTITY_ID,
        name: "obs-identity-token-active",
        authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
        accessTokenTTL: 60 * 60 * 24 * 90,
        accessTokenMaxTTL: 60 * 60 * 24 * 90,
        accessTokenNumUses: 2,
        accessTokenNumUsesLimit: 0,
        accessTokenLastUsedAt: now,
        isAccessTokenRevoked: false,
        createdAt: days(-1),
        updatedAt: now
      }
    ])
    .onConflict("id")
    .merge();

  log("Seeding service tokens (expired/pending/active)...");
  const scopesJson = JSON.stringify([{ environment: environment.slug, secretPath: "/" }]);
  await knex(TableName.ServiceToken)
    .insert([
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_SERVICE_TOKEN_EXPIRED_ID,
        name: "obs-service-token-expired",
        scopes: knex.raw("?::jsonb", [scopesJson]),
        permissions: [],
        secretHash: "seed-not-for-auth",
        createdBy: user.id,
        projectId: project.id,
        expiresAt: days(-2),
        lastUsed: days(-3)
      },
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_SERVICE_TOKEN_PENDING_ID,
        name: "obs-service-token-pending",
        scopes: knex.raw("?::jsonb", [scopesJson]),
        permissions: [],
        secretHash: "seed-not-for-auth",
        createdBy: user.id,
        projectId: project.id,
        expiresAt: days(3),
        lastUsed: days(-1)
      },
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_SERVICE_TOKEN_ACTIVE_ID,
        name: "obs-service-token-active",
        scopes: knex.raw("?::jsonb", [scopesJson]),
        permissions: [],
        secretHash: "seed-not-for-auth",
        createdBy: user.id,
        projectId: project.id,
        expiresAt: days(30),
        lastUsed: now
      }
    ])
    .onConflict("id")
    .merge();

  log("Seeding webhooks (failed/active)...");
  await knex(TableName.Webhook)
    .insert([
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_WEBHOOK_FAILED_ID,
        secretPath: "/",
        envId: environment.id,
        isDisabled: false,
        type: "general",
        lastStatus: "500",
        lastRunErrorMessage: "Synthetic seed failure",
        encryptedUrl: Buffer.from("seed-webhook-failed-url")
      },
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_WEBHOOK_ACTIVE_ID,
        secretPath: "/payments",
        envId: environment.id,
        isDisabled: false,
        type: "general",
        lastStatus: "200",
        lastRunErrorMessage: null,
        encryptedUrl: Buffer.from("seed-webhook-active-url")
      }
    ])
    .onConflict("id")
    .merge();

  log("Seeding app connection...");
  await knex(TableName.AppConnection)
    .insert({
      // eslint-disable-next-line
      // @ts-ignore
      id: OBS_APP_CONNECTION_ID,
      name: "obs-seed-aws-connection",
      app: "aws",
      method: "access-key",
      encryptedCredentials: Buffer.from("seed-encrypted-credentials"),
      orgId: org.id,
      projectId: project.id
    })
    .onConflict("id")
    .merge({
      name: "obs-seed-aws-connection",
      app: "aws",
      method: "access-key",
      encryptedCredentials: Buffer.from("seed-encrypted-credentials"),
      orgId: org.id,
      projectId: project.id
    });

  log("Seeding secret syncs (failed/pending/active)...");
  await knex(TableName.SecretSync)
    .insert([
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_SECRET_SYNC_FAILED_ID,
        name: "obs-secret-sync-failed",
        destination: "aws-secrets-manager",
        destinationConfig: {},
        syncOptions: {},
        projectId: project.id,
        connectionId: OBS_APP_CONNECTION_ID,
        syncStatus: "failed",
        lastSyncMessage: "Seeded failure for observability UI",
        lastSyncedAt: days(-1)
      },
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_SECRET_SYNC_PENDING_ID,
        name: "obs-secret-sync-pending",
        destination: "aws-secrets-manager",
        destinationConfig: {},
        syncOptions: {},
        projectId: project.id,
        connectionId: OBS_APP_CONNECTION_ID,
        syncStatus: "pending",
        lastSyncMessage: "Seeded pending sync",
        lastSyncedAt: days(-1)
      },
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: OBS_SECRET_SYNC_ACTIVE_ID,
        name: "obs-secret-sync-active",
        destination: "aws-secrets-manager",
        destinationConfig: {},
        syncOptions: {},
        projectId: project.id,
        connectionId: OBS_APP_CONNECTION_ID,
        syncStatus: "success",
        lastSyncMessage: null,
        lastSyncedAt: now
      }
    ])
    .onConflict("id")
    .merge();

  log("Seeding PKI certificates (expiring in 2 days)...");
  const certProject =
    (await knex(TableName.Project).where({ orgId: org.id, type: "cert-manager" }).first()) ??
    (await knex(TableName.Project).where({ orgId: org.id }).orderBy("createdAt", "asc").first());
  if (certProject) {
    const certPlaceholder = Buffer.from("obs-seed-cert-placeholder");
    await knex(TableName.Certificate)
      .insert([
        {
          id: OBS_CERT_EXPIRING_SOON_ID,
          projectId: certProject.id,
          status: "active",
          serialNumber: "obs-cert-expiring-soon-001",
          friendlyName: "obs-api-tls-expiring-soon",
          commonName: "api.demo.example.com",
          notBefore: days(-60),
          notAfter: days(2),
          caId: null
        },
        {
          id: OBS_CERT_EXPIRING_SOON_2_ID,
          projectId: certProject.id,
          status: "active",
          serialNumber: "obs-cert-expiring-soon-002",
          friendlyName: "obs-webhook-mtls-expiring-soon",
          commonName: "webhook.demo.example.com",
          notBefore: days(-90),
          notAfter: days(2),
          caId: null
        }
      ])
      .onConflict("id")
      .merge();

    for (const certId of [OBS_CERT_EXPIRING_SOON_ID, OBS_CERT_EXPIRING_SOON_2_ID]) {
      const existingBody = await knex(TableName.CertificateBody).where({ certId }).first();
      if (!existingBody) {
        await knex(TableName.CertificateBody).insert({
          certId,
          encryptedCertificate: certPlaceholder,
          encryptedCertificateChain: null
        });
      }
    }
    log("Added 2 certificates expiring in 2 days.");
  } else {
    log("Skipping certificates: no project found.");
  }

  const demoWidgetNames = [
    "Critical Failures",
    "Expiring Access & Certificates",
    "Secret Sync Status",
    "Failed Resources",
    "Expiring in 7 Days",
    "Pending Remediation",
    "Machine Identities",
    "Active Users",
    "Live Audit Logs"
  ];
  log("Replacing only demo widgets (preserving user-created widgets)...");
  // Delete by name first
  await knex(TableName.ObservabilityWidget)
    .where({ orgId: org.id })
    .whereIn("name", demoWidgetNames)
    .del();
  // Also remove any leftover metrics widgets with legacy config schemas
  // (widgets created by older versions of this seed that may fail validation)
  await knex(TableName.ObservabilityWidget)
    .where({ orgId: org.id, type: ObservabilityWidgetType.Metrics })
    .whereRaw(`config->>'metricType' IS NULL`)
    .del();

  await knex(TableName.ObservabilityWidget).insert([
    {
      name: "Critical Failures",
      description: "Resources currently failing and requiring immediate action",
      orgId: org.id,
      type: ObservabilityWidgetType.Events,
      config: JSON.stringify({
        resourceTypes: [ObservabilityResourceType.SecretSync, ObservabilityResourceType.Webhook],
        eventTypes: ["failed"],
        thresholds: { expirationDays: 7 }
      }),
      refreshInterval: 20,
      icon: "alert-triangle",
      color: "#ef4444",
      isBuiltIn: true
    },
    {
      name: "Expiring Access & Certificates",
      description: "Tokens and certificates nearing expiration windows",
      orgId: org.id,
      type: ObservabilityWidgetType.Events,
      config: JSON.stringify({
        resourceTypes: [
          ObservabilityResourceType.MachineIdentityToken,
          ObservabilityResourceType.ServiceToken,
          ObservabilityResourceType.PkiCertificate
        ],
        eventTypes: ["expired", "pending", "active"],
        thresholds: { expirationDays: 14 }
      }),
      refreshInterval: 45,
      icon: "clock",
      color: "#f59e0b",
      isBuiltIn: true
    },
    {
      name: "Secret Sync Status",
      description: "Operational state for secret sync integrations",
      orgId: org.id,
      type: ObservabilityWidgetType.Events,
      config: JSON.stringify({
        resourceTypes: [ObservabilityResourceType.SecretSync, ObservabilityResourceType.Webhook],
        eventTypes: ["failed", "pending", "active"],
        thresholds: {}
      }),
      refreshInterval: 30,
      icon: "refresh-cw",
      color: "#3b82f6",
      isBuiltIn: true
    },
    {
      name: "Failed Resources",
      description: "Total number of resources currently in a failed state",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.StatusCount,
        status: ObservabilityItemStatus.Failed
      }),
      refreshInterval: 30,
      icon: "x-circle",
      color: "#ef4444",
      isBuiltIn: true
    },
    {
      name: "Expiring in 7 Days",
      description: "Resources expiring within the next 7 days",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.ExpiringSoon,
        thresholdDays: 7
      }),
      refreshInterval: 60,
      icon: "timer",
      color: "#f59e0b",
      isBuiltIn: true
    },
    {
      name: "Pending Remediation",
      description: "Total resources currently pending action or renewal",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.StatusCount,
        status: ObservabilityItemStatus.Pending
      }),
      refreshInterval: 45,
      icon: "clock",
      color: "#8b5cf6",
      isBuiltIn: true
    },
    {
      name: "Machine Identities",
      description: "Total active machine identities in the organization",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.IdentityCount,
        identityType: "machine"
      }),
      refreshInterval: 120,
      icon: "bot",
      color: "#10b981",
      isBuiltIn: true
    },
    {
      name: "Active Users",
      description: "Total active user members in the organization",
      orgId: org.id,
      type: ObservabilityWidgetType.Metrics,
      config: JSON.stringify({
        metricType: MetricType.IdentityCount,
        identityType: "user"
      }),
      refreshInterval: 120,
      icon: "users",
      color: "#06b6d4",
      isBuiltIn: true
    },
    {
      name: "Live Audit Logs",
      description: "Real-time audit log stream across the organization",
      orgId: org.id,
      type: ObservabilityWidgetType.Logs,
      config: JSON.stringify({ limit: 300 }),
      refreshInterval: 5,
      icon: "activity",
      color: "#3b82f6",
      isBuiltIn: true
    }
  ]);

  // Rebuild the default view layout so widget IDs are correctly wired.
  // This repairs layouts that were wiped to 3 slots by the built-in migration.
  const freshWidgets = await knex(TableName.ObservabilityWidget).where({ orgId: org.id });
  const metricsWidgets = freshWidgets.filter((w) => w.type === ObservabilityWidgetType.Metrics);
  const byName = (name: string) => freshWidgets.find((w) => w.name.toLowerCase() === name.toLowerCase());

  const metricSlots = [
    "Failed Resources",
    "Expiring in 7 Days",
    "Pending Remediation",
    "Machine Identities",
    "Active Users"
  ];

  const metricsRows = metricSlots
    .map((name, i) => {
      const w = byName(name) ?? metricsWidgets[i];
      if (!w) return null;
      return { uid: `default-metric-${i + 1}`, tmpl: "_backend_metrics", widgetId: w.id, x: (i % 4) * 3, y: Math.floor(i / 4), w: 3, h: 1 };
    })
    .filter(Boolean);

  const allFailuresWidget = byName("Critical Failures");
  const secretSyncsWidget = byName("Secret Sync Status");
  const logsWidget = byName("Live Audit Logs");

  const defaultLayout = [
    ...metricsRows,
    { uid: "default-all-failures", tmpl: "all-failures", widgetId: allFailuresWidget?.id, x: 0, y: 2, w: 6, h: 2 },
    { uid: "default-secret-syncs", tmpl: "secret-syncs", widgetId: secretSyncsWidget?.id, x: 6, y: 2, w: 6, h: 2 },
    { uid: "default-live-logs", tmpl: "logs", widgetId: logsWidget?.id, x: 0, y: 4, w: 12, h: 2 }
  ];

  const defaultView = await knex(TableName.ObservabilityWidgetView)
    .where({ orgId: org.id, isDefault: true })
    .first();

  if (defaultView) {
    await knex(TableName.ObservabilityWidgetView)
      .where({ id: defaultView.id })
      .update({ items: JSON.stringify(defaultLayout) });
    log("Updated default view layout with fresh widget IDs.");
  } else {
    await knex(TableName.ObservabilityWidgetView).insert({
      name: "Fail alerts",
      orgId: org.id,
      userId: null,
      scope: "organization",
      isDefault: true,
      items: JSON.stringify(defaultLayout)
    });
    log("Created default view with full layout.");
  }

  log("Done. Demo data added without touching existing user data. Widgets: Critical Failures, Expiring Access, Secret Sync Status, Failed/Pending/Machine/ActiveUsers metrics, Live Audit Logs.");
};
