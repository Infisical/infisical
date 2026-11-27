import type { TIdentityProjectPrivilege } from "@app/hooks/api/identityProjectAdditionalPrivilege/types";
import type { TProjectUserPrivilege } from "@app/hooks/api/projectUserAdditionalPrivilege/types";
import type { TProjectPermission } from "@app/hooks/api/roles/types";

export type DemoUserPrivilege = TProjectUserPrivilege;
export type DemoIdentityPrivilege = TIdentityProjectPrivilege & {
  projectId: string;
  identityId: string;
};

const LEGACY_PROJECT_ID = "platform-core";
const CI_DEPLOYER = "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11";
const TERRAFORM = "1f6c3e9b-7a24-4d0e-8b51-c2e9a7d40f36";

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const created = new Date("2026-08-20T12:00:00.000Z");

const read = (environment: string, secretPath: string): TProjectPermission[] => [
  {
    subject: "secrets",
    action: ["describeSecret", "readValue"],
    conditions: { environment: { $eq: environment }, secretPath: { $glob: secretPath } }
  },
  {
    subject: "secret-folders",
    action: ["read"],
    conditions: { environment: { $eq: environment }, secretPath: { $glob: secretPath } }
  }
];

const window = (range: string, from: number, to: number) =>
  ({
    isTemporary: true,
    temporaryMode: "relative",
    temporaryRange: range,
    temporaryAccessStartTime: at(from),
    temporaryAccessEndTime: at(to)
  }) as const;

const permanent = { isTemporary: false } as const;

const STRESSED_SLUGS = [
  "incident-response-break-glass-production-database-read-access",
  "quarterly-compliance-audit-ledger-exports-read-only",
  "vendor-onboarding-fraud-detection-api-token-rotation",
  "platform-migration-terraform-state-bucket-credentials",
  "on-call-escalation-observability-shared-credentials",
  "legacy-monolith-phase-two-database-connection-strings",
  "partner-portal-oauth-client-secret-rotation-window",
  "release-train-staging-environment-feature-flags"
];

export const demoUserPrivileges = (): DemoUserPrivilege[] => [
  {
    id: "upriv-1",
    projectMembershipId: "opm-2",
    slug: "prod-read-payments",
    createdAt: created,
    updatedAt: created,
    permissions: read("prod", "/payments/**"),
    ...permanent
  },
  {
    id: "upriv-2",
    projectMembershipId: "opm-2",
    slug: "staging-hotfix",
    createdAt: created,
    updatedAt: created,
    permissions: [
      { subject: "secrets", action: ["create", "edit"], conditions: { environment: "staging" } }
    ],
    ...window("4h", -1, 3)
  },
  {
    id: "upriv-3",
    projectMembershipId: "opm-2",
    slug: "approved-prod-access",
    createdAt: created,
    updatedAt: created,
    permissions: read("prod", "/"),
    isLinkedToAccessApproval: true,
    accessApprovalRequestId: "req-approved-1",
    policyApproverUserIds: ["u-sarah"],
    ...window("1d", -2, 22)
  },
  ...STRESSED_SLUGS.map((slug, index) => ({
    id: `upriv-stress-${index}`,
    projectMembershipId: "pcm-diego",
    slug,
    createdAt: created,
    updatedAt: created,
    permissions: read(["dev", "staging", "prod"][index % 3], "/**"),
    ...(index % 3 === 0 ? window("2h", -6, index === 0 ? -4 : 2) : permanent)
  }))
];

export const demoIdentityPrivileges = (): DemoIdentityPrivilege[] => [
  {
    id: "ipriv-1",
    projectId: LEGACY_PROJECT_ID,
    identityId: CI_DEPLOYER,
    slug: "deploy-prod-secrets",
    createdAt: created,
    updatedAt: created,
    permissions: read("prod", "/deploy/**"),
    ...permanent
  },
  {
    id: "ipriv-2",
    projectId: LEGACY_PROJECT_ID,
    identityId: CI_DEPLOYER,
    slug: "migration-window",
    createdAt: created,
    updatedAt: created,
    permissions: [{ subject: "secret-imports", action: ["read", "create"] }],
    ...window("7d", -24, 144)
  },
  ...STRESSED_SLUGS.map((slug, index) => ({
    id: `ipriv-stress-${index}`,
    projectId: LEGACY_PROJECT_ID,
    identityId: TERRAFORM,
    slug,
    createdAt: created,
    updatedAt: created,
    permissions: read(["prod", "dev", "staging"][index % 3], "/**"),
    ...(index % 2 === 0 ? window("1d", -30, index === 0 ? -6 : 18) : permanent)
  }))
];
