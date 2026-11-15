import { createMongoAbility } from "@casl/ability";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApproverType,
  EnforcementLevel,
  type TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";
import { CertificateRequestStatus } from "@app/hooks/api/certificates/enums";
import { PkiAlertEventTypeV2, type TPkiAlertV2 } from "@app/hooks/api/pkiAlertsV2/types";
import type {
  TPkiApplication,
  TPkiApplicationMember,
  TPkiApplicationPermissionSet
} from "@app/hooks/api/pkiApplications/types";
import { PkiSync, PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { alertsDemo } from "../cert-manager-settings/demo-alerts";
import { certificatesDemo } from "../certificates/demo";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { PkiApplicationsAdapter } from "./contract";
import { enrollmentDemo } from "./demo-enrollment";
import {
  DEMO_PROJECT_ID,
  demoApplications,
  demoCertificateRequests,
  demoMember,
  demoMembers,
  demoMemberSeeds,
  demoProfiles,
  demoProfileSlugs
} from "./demo-store";

const ready = <T>(data: T) => ({ data, isPending: false, error: null });
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const now = () => new Date().toISOString();

const appId = (name: string) =>
  demoApplications.get().find((application) => application.name === name)?.id ?? name;
const PAYMENTS = appId("payments-api");
const PLATFORM = appId("platform-core");

const fullAccess = createMongoAbility<TPkiApplicationPermissionSet>([
  { action: "manage", subject: "all" }
]);

const sync = (
  id: string,
  applicationId: string,
  name: string,
  destination: PkiSync,
  app: AppConnection,
  connectionName: string,
  status: PkiSyncStatus | null,
  syncedHoursAgo: number | null,
  extra: Partial<TPkiSync> = {}
) =>
  ({
    id,
    name,
    description: null,
    destination,
    destinationConfig: {},
    connectionId: `conn-${id}`,
    createdAt: ago(24 * 60),
    updatedAt: ago(24 * 2),
    isAutoSyncEnabled: true,
    projectId: DEMO_PROJECT_ID,
    applicationId,
    syncStatus: status,
    lastSyncJobId: null,
    lastSyncedAt: syncedHoursAgo === null ? null : ago(syncedHoursAgo),
    lastSyncMessage: null,
    lastHealthCheckRanAt: null,
    lastHealthCheckStatus: null,
    lastHealthCheckMessage: null,
    importStatus: null,
    lastImportJobId: null,
    lastImportedAt: null,
    lastImportMessage: null,
    removeStatus: null,
    lastRemoveJobId: null,
    lastRemovedAt: null,
    lastRemoveMessage: null,
    syncOptions: { canImportCertificates: false, canRemoveCertificates: true },
    connection: { app, id: `conn-${id}`, name: connectionName },
    ...extra
  }) as TPkiSync;

const syncs = createFixtureStore<TPkiSync[]>([
  sync(
    "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b61",
    PAYMENTS,
    "payments-acm-us-east-1",
    PkiSync.AwsCertificateManager,
    AppConnection.AWS,
    "aws-prod",
    PkiSyncStatus.Succeeded,
    2
  ),
  sync(
    "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b62",
    PAYMENTS,
    "payments-keyvault",
    PkiSync.AzureKeyVault,
    AppConnection.AzureKeyVault,
    "azure-payments",
    PkiSyncStatus.Failed,
    26,
    { lastSyncMessage: "The service principal is missing the Key Vault Certificates Officer role" }
  ),
  sync(
    "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b63",
    PLATFORM,
    "platform-edge-cloudflare",
    PkiSync.CloudflareCustomCertificate,
    AppConnection.Cloudflare,
    "cloudflare-acme",
    PkiSyncStatus.Running,
    0
  )
]);

const policies = createFixtureStore<TApprovalPolicy[]>([
  {
    id: "pol-8f2c1d3e-4a5b-4c6d-9e7f-0a1b2c3d4e71",
    projectId: DEMO_PROJECT_ID,
    name: "Production TLS review",
    maxRequestTtl: "7d",
    type: ApprovalPolicyType.CertRequest,
    conditions: { version: 1, conditions: [{ profileNames: ["tls-server"] }] },
    constraints: { version: 1, constraints: {} },
    steps: [
      {
        name: "Security review",
        requiredApprovals: 1,
        notifyApprovers: true,
        approvers: [{ type: ApproverType.Group, id: "group-platform-security" }]
      },
      {
        name: "Service owner",
        requiredApprovals: 1,
        notifyApprovers: true,
        approvers: [{ type: ApproverType.User, id: "user-maya-chen" }]
      }
    ],
    bypassForMachineIdentities: true,
    enforcementLevel: EnforcementLevel.Hard,
    bypassers: [],
    scopeType: ApprovalPolicyScope.PkiApplication,
    scopeId: PAYMENTS,
    createdAt: ago(24 * 30),
    updatedAt: ago(24 * 4)
  },
  {
    id: "pol-8f2c1d3e-4a5b-4c6d-9e7f-0a1b2c3d4e72",
    projectId: DEMO_PROJECT_ID,
    name: "Client certificates",
    maxRequestTtl: null,
    type: ApprovalPolicyType.CertRequest,
    conditions: { version: 1, conditions: [{ profileNames: ["mtls-client", "code-signing"] }] },
    constraints: { version: 1, constraints: {} },
    steps: [
      {
        name: null,
        requiredApprovals: 2,
        notifyApprovers: true,
        approvers: [
          { type: ApproverType.User, id: "user-maya-chen" },
          { type: ApproverType.User, id: "user-jonas-weber" }
        ]
      }
    ],
    enforcementLevel: EnforcementLevel.Hard,
    bypassers: [],
    scopeType: ApprovalPolicyScope.Project,
    scopeId: DEMO_PROJECT_ID,
    createdAt: ago(24 * 90),
    updatedAt: ago(24 * 90)
  }
]);

const policyApplication: Record<string, string> = {
  "pol-8f2c1d3e-4a5b-4c6d-9e7f-0a1b2c3d4e71": PAYMENTS,
  "pol-8f2c1d3e-4a5b-4c6d-9e7f-0a1b2c3d4e72": PAYMENTS
};

const legacyAlerts = createFixtureStore<TPkiAlertV2[]>([
  {
    id: "legacy-alert-9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c51",
    projectId: DEMO_PROJECT_ID,
    applicationId: PAYMENTS,
    name: "payments-expiry-email",
    description: "Created before application alerting moved to the shared alert channels.",
    eventType: PkiAlertEventTypeV2.EXPIRATION,
    alertBefore: "14d",
    filters: [],
    enabled: true,
    notificationConfig: null,
    channels: [],
    lastRun: { timestamp: ago(30), status: "success", error: null },
    createdAt: ago(24 * 200),
    updatedAt: ago(24 * 200)
  } as TPkiAlertV2
]);

const removeMemberById = (applicationId: string, kind: string, memberId: string) =>
  demoMembers.update((current) =>
    current.filter(
      (entry) =>
        entry.applicationId !== applicationId ||
        (kind === "user" && entry.actorUserId !== memberId) ||
        (kind === "identity" && entry.actorIdentityId !== memberId) ||
        (kind === "group" && entry.actorGroupId !== memberId)
    )
  );

const seedName = (kind: "user" | "identity" | "group", id: string) => {
  const pool = {
    user: demoMemberSeeds.users,
    identity: demoMemberSeeds.identities,
    group: demoMemberSeeds.groups
  }[kind];
  return pool.find((entry) => entry.id === id);
};

const addMember = (
  applicationId: string,
  kind: "user" | "identity" | "group",
  memberId: string,
  role: string
) => {
  const seed = seedName(kind, memberId);
  const created = demoMember(applicationId, {
    kind,
    actorId: memberId,
    role,
    name: seed?.name ?? memberId,
    email: demoMemberSeeds.users.find((entry) => entry.id === memberId)?.email,
    createdAt: now()
  });
  demoMembers.update((current) => [...current, created]);
  return created;
};

export const pkiApplicationsDemo: PkiApplicationsAdapter = {
  ...enrollmentDemo,
  useApplications: ({ search, limit = 20, offset = 0 }) => {
    const applications = demoApplications.use();
    const profiles = demoProfiles.use();
    const members = demoMembers.use();
    const certificates =
      certificatesDemo.useCertificates({ projectId: DEMO_PROJECT_ID, offset: 0, limit: 10_000 })
        .data?.certificates ?? [];
    const needle = search?.trim().toLowerCase();
    const matched = applications
      .filter((entry) => !needle || entry.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
    return ready({
      total: matched.length,
      applications: matched.slice(offset, offset + limit).map((entry) => ({
        ...entry,
        profileCount: profiles.filter((profile) => profile.applicationId === entry.id).length,
        memberCount: members.filter((member) => member.applicationId === entry.id).length,
        certificateCount: certificates.filter((cert) => cert.applicationName === entry.name).length
      }))
    });
  },
  useApplicationByName: (name) => {
    const found = demoApplications.use().find((entry) => entry.name === name);
    return { data: found, isPending: false, error: found ? null : new Error("Not found") };
  },
  useApplicationProfiles: (applicationId) =>
    ready(demoProfiles.use().filter((entry) => entry.applicationId === applicationId)),
  useApplicationMembers: (applicationId) =>
    ready(demoMembers.use().filter((entry) => entry.applicationId === applicationId)),
  useApplicationPermissions: (applicationId) =>
    ready({
      permission: fullAccess,
      memberships: [{ id: `${applicationId}-viewer`, roles: [{ role: "admin" }] }]
    }),
  useApplicationCertificates: (dto) => {
    const name = demoApplications.use().find((entry) => entry.id === dto.applicationId)?.name;
    const rows = (
      certificatesDemo.useCertificates({ projectId: DEMO_PROJECT_ID, offset: 0, limit: 10_000 })
        .data?.certificates ?? []
    ).filter((cert) => Boolean(name) && cert.applicationName === name);
    const needle = dto.search?.trim().toLowerCase();
    const statuses = new Set(typeof dto.status === "string" ? dto.status.split(",") : []);
    const matched = rows
      .filter(
        (cert) =>
          !needle ||
          [cert.commonName, cert.serialNumber, cert.altNames ?? ""].some((value) =>
            value.toLowerCase().includes(needle)
          )
      )
      .filter((cert) => !statuses.size || statuses.has(cert.status));
    return ready({
      certificates: matched.slice(dto.offset, dto.offset + dto.limit),
      totalCount: matched.length
    });
  },
  useMemberCandidates: () => ({
    users: ready(demoMemberSeeds.users.map(({ id, name }) => ({ value: id, label: name }))),
    identities: ready(
      demoMemberSeeds.identities.map(({ id, name }) => ({ value: id, label: name }))
    ),
    groups: ready(demoMemberSeeds.groups.map(({ id, name }) => ({ value: id, label: name })))
  }),
  useCertificateRequests: ({ applicationId, offset = 0, limit = 20, search, status }) => {
    const needle = search?.trim().toLowerCase();
    const matched = demoCertificateRequests
      .use()
      .filter((entry) => !applicationId || entry.applicationId === applicationId)
      .filter(
        (entry) =>
          !needle ||
          [entry.commonName ?? "", entry.altNames ?? ""].some((value) =>
            value.toLowerCase().includes(needle)
          )
      )
      .filter((entry) => !status || entry.status.startsWith(status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ready({
      certificateRequests: matched.slice(offset, offset + limit),
      totalCount: matched.length
    });
  },
  useApplicationSyncs: (_projectId, applicationId) =>
    ready(syncs.use().filter((entry) => entry.applicationId === applicationId)),
  useApplicationPolicies: (applicationId) =>
    ready(policies.use().filter((entry) => policyApplication[entry.id] === applicationId)),
  useApplicationAlerts: alertsDemo.useAlerts,
  useLegacyAlerts: (applicationId) =>
    ready(legacyAlerts.use().filter((entry) => entry.applicationId === applicationId)),
  useCreateApplication: fixtureMutation(({ name, description, profileIds = [] }) => {
    const created: TPkiApplication = {
      id: crypto.randomUUID(),
      projectId: DEMO_PROJECT_ID,
      name,
      description: description || null,
      createdAt: now(),
      updatedAt: now()
    };
    demoApplications.update((current) => [...current, created]);
    demoProfiles.update((current) => [
      ...current,
      ...profileIds.map((profileId) => ({
        applicationId: created.id,
        profileId,
        profileSlug: demoProfileSlugs[profileId] ?? profileId,
        createdAt: now(),
        updatedAt: now()
      }))
    ]);
    return created;
  }),
  useUpdateApplication: fixtureMutation(({ applicationId, name, description }) => {
    let updated: TPkiApplication | undefined;
    demoApplications.update((current) =>
      current.map((entry) => {
        if (entry.id !== applicationId) return entry;
        updated = {
          ...entry,
          name: name ?? entry.name,
          description: description === undefined ? entry.description : description,
          updatedAt: now()
        };
        return updated;
      })
    );
    if (!updated) throw new Error("Application not found");
    return updated;
  }),
  useDeleteApplication: fixtureMutation(({ applicationId }) => {
    demoApplications.update((current) => current.filter((entry) => entry.id !== applicationId));
    demoProfiles.update((current) =>
      current.filter((entry) => entry.applicationId !== applicationId)
    );
    demoMembers.update((current) =>
      current.filter((entry) => entry.applicationId !== applicationId)
    );
    return { applicationId };
  }),
  useAttachProfiles: fixtureMutation(({ applicationId, profileIds }) => {
    demoProfiles.update((current) => [
      ...current,
      ...profileIds
        .filter(
          (profileId) =>
            !current.some(
              (entry) => entry.applicationId === applicationId && entry.profileId === profileId
            )
        )
        .map((profileId) => ({
          applicationId,
          profileId,
          profileSlug: demoProfileSlugs[profileId] ?? profileId,
          createdAt: now(),
          updatedAt: now()
        }))
    ]);
    return { applicationId };
  }),
  useDetachProfile: fixtureMutation(({ applicationId, profileId }) => {
    demoProfiles.update((current) =>
      current.filter(
        (entry) => entry.applicationId !== applicationId || entry.profileId !== profileId
      )
    );
    return { applicationId, profileId };
  }),
  useAddMember: fixtureMutation(({ applicationId, kind, memberId, role }) =>
    addMember(applicationId, kind, memberId, role)
  ),
  useAddUserMembers: fixtureMutation(({ applicationId, userIds, role }) => ({
    memberships: userIds.map((userId) => addMember(applicationId, "user", userId, role)),
    skipped: [],
    unresolved: []
  })),
  useUpdateMemberRole: fixtureMutation(({ applicationId, kind, memberId, role }) => {
    const matches = (entry: TPkiApplicationMember) =>
      entry.applicationId === applicationId &&
      ((kind === "user" && entry.actorUserId === memberId) ||
        (kind === "identity" && entry.actorIdentityId === memberId) ||
        (kind === "group" && entry.actorGroupId === memberId));
    demoMembers.update((current) =>
      current.map((entry) => (matches(entry) ? { ...entry, role, updatedAt: now() } : entry))
    );
    const updated = demoMembers.get().find(matches);
    if (!updated) throw new Error("Member not found");
    return updated;
  }),
  useRemoveMember: fixtureMutation(({ applicationId, kind, memberId }) => {
    removeMemberById(applicationId, kind, memberId);
    return { applicationId };
  }),
  useCancelCertificateRequest: fixtureMutation(({ requestId }) => {
    demoCertificateRequests.update((current) =>
      current.map((entry) =>
        entry.id === requestId
          ? { ...entry, status: "failed", errorMessage: "Cancelled by a member" }
          : entry
      )
    );
    return { status: "failed", cancelled: true, errorMessage: "Cancelled by a member" };
  }),
  useTriggerRequestValidation: fixtureMutation(() => ({
    status: CertificateRequestStatus.PENDING_VALIDATION,
    orderStatus: "pending"
  })),
  useTriggerSync: fixtureMutation(({ syncId }) => {
    syncs.update((current) =>
      current.map((entry) =>
        entry.id === syncId
          ? { ...entry, syncStatus: PkiSyncStatus.Succeeded, lastSyncedAt: now() }
          : entry
      )
    );
    return { syncId };
  }),
  useCreatePolicy: fixtureMutation(({ policyType, scope, scopeId, ...dto }) => {
    const created = {
      id: `pol-${crypto.randomUUID()}`,
      projectId: DEMO_PROJECT_ID,
      name: dto.name,
      maxRequestTtl: dto.maxRequestTtl ?? null,
      type: policyType,
      conditions: { version: 1, conditions: dto.conditions },
      constraints: { version: 1, constraints: dto.constraints },
      steps: dto.steps,
      bypassForMachineIdentities: dto.bypassForMachineIdentities ?? false,
      enforcementLevel: EnforcementLevel.Hard,
      bypassers: [],
      scopeType: scope,
      scopeId,
      createdAt: now(),
      updatedAt: now()
    } as TApprovalPolicy;
    policyApplication[created.id] = scopeId;
    policies.update((current) => [created, ...current]);
    return created;
  }),
  useUpdatePolicy: fixtureMutation(({ policyId, policyType: _type, ...changes }) => {
    policies.update((current) =>
      current.map((entry) =>
        entry.id === policyId
          ? ({
              ...entry,
              ...changes,
              conditions: changes.conditions
                ? { version: 1, conditions: changes.conditions }
                : entry.conditions,
              constraints: changes.constraints
                ? { version: 1, constraints: changes.constraints }
                : entry.constraints,
              updatedAt: now()
            } as TApprovalPolicy)
          : entry
      )
    );
    return policies.get().find((entry) => entry.id === policyId)!;
  }),
  useDeletePolicy: fixtureMutation(({ policyId }) => {
    policies.update((current) => current.filter((entry) => entry.id !== policyId));
    return policyId;
  }),
  useUpdateAlert: alertsDemo.useUpdateAlert,
  useDeleteAlert: alertsDemo.useDeleteAlert,
  useDeleteLegacyAlert: fixtureMutation(({ alertId }) => {
    legacyAlerts.update((current) => current.filter((entry) => entry.id !== alertId));
    return { id: alertId };
  })
};
