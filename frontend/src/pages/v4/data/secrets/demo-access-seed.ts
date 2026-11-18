import {
  SecretFolderRole,
  type TFolderAccess,
  type TFolderAccessMembership
} from "@app/hooks/api/folderAccess/types";

export type DemoAccessActor = {
  type: "user" | "identity";
  id: string;
  name: string;
  email?: string;
  membership: TFolderAccessMembership;
};

export type DemoFolderAccess = {
  actors: DemoAccessActor[];
  grants: (TFolderAccess & { actor: string })[];
};

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const grant = (
  actor: string,
  environment: string,
  secretPath: string,
  permission: SecretFolderRole,
  window?: { range: string; from: number; to: number }
): TFolderAccess & { actor: string } => ({
  id: `grant-${actor}-${environment}-${secretPath}`,
  actor,
  projectId: "payments-api",
  folderId: `payments-api:${environment}:${secretPath}`,
  permission,
  environment,
  secretPath,
  isTemporary: Boolean(window),
  temporaryMode: window ? "relative" : null,
  temporaryRange: window?.range ?? null,
  temporaryAccessStartTime: window ? hoursFromNow(window.from) : null,
  temporaryAccessEndTime: window ? hoursFromNow(window.to) : null,
  createdAt: "2026-09-14T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z"
});

const STRESSED_PATHS = [
  "/services/payments/stripe-webhooks/production-signing-keys",
  "/services/payments/ledger/reconciliation/nightly-exports",
  "/infrastructure/terraform/modules/networking/transit-gateway-attachments",
  "/teams/platform-engineering/shared-credentials/observability",
  "/vendors/third-party-integrations/fraud-detection/api-tokens",
  "/legacy/monolith-migration/phase-two/database-credentials",
  "/services/notifications/email/transactional-provider",
  "/services/identity/oauth-clients/partner-portal"
];

const memberGrants = [
  grant("user:u-priya", "dev", "/", SecretFolderRole.Edit),
  grant("user:u-priya", "staging", "/payments", SecretFolderRole.Read),
  grant("user:u-priya", "prod", "/payments/stripe", SecretFolderRole.List, {
    range: "4h",
    from: -1,
    to: 3
  }),
  grant("identity:4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11", "prod", "/deploy", SecretFolderRole.Read),
  grant(
    "identity:4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11",
    "staging",
    "/deploy",
    SecretFolderRole.Manage
  ),
  ...STRESSED_PATHS.flatMap((path, index) => [
    grant(
      "user:u-diego",
      ["dev", "staging", "prod"][index % 3],
      path,
      Object.values(SecretFolderRole)[index % 5],
      index % 3 === 1 ? { range: "1d", from: -30, to: index === 1 ? -6 : 18 } : undefined
    ),
    grant(
      "identity:9d27a4f1-0c3b-4e8a-b5f2-6a1d7c4e2b90",
      ["prod", "dev", "staging"][index % 3],
      path,
      Object.values(SecretFolderRole)[(index + 2) % 5],
      index % 4 === 0 ? { range: "7d", from: -24, to: 144 } : undefined
    )
  ])
];

const role = (name: string) => ({ id: name.toLowerCase(), slug: name.toLowerCase(), name });
export const STRESSED_ROLE = "Platform reliability read-only auditor";
const stressedActors: DemoAccessActor[] = [
  {
    type: "identity",
    id: "7f3c9e21-5a4d-4b8e-9c16-2d8f0a7b4e53",
    name: "github-actions-settlement-reconciliation-deployer-production",
    membership: {
      id: "membership-gha",
      isProjectAdmin: false,
      roles: [role(STRESSED_ROLE)]
    }
  },
  {
    type: "user",
    id: "u-alexandra",
    name: "Alexandra Konstantinopoulou-Whitfield",
    email: "alexandra.konstantinopoulou-whitfield@acme.dev",
    membership: {
      id: "membership-alexandra",
      isProjectAdmin: false,
      roles: [role(STRESSED_ROLE), role("Viewer")]
    }
  }
];

export const seedFolderAccess = (large: boolean): DemoFolderAccess => ({
  actors: [
    ...(large ? stressedActors : []),
    {
      type: "user",
      id: "u-sarah",
      name: "Sarah Lin",
      email: "sarah@acme.dev",
      membership: { id: "membership-sarah", isProjectAdmin: true, roles: [role("Admin")] }
    },
    {
      type: "user",
      id: "u-marcus",
      name: "Marcus Webb",
      email: "marcus@acme.dev",
      membership: { id: "membership-marcus", isProjectAdmin: false, roles: [role("Developer")] }
    },
    {
      type: "user",
      id: "u-priya",
      name: "Priya Raman",
      email: "priya@acme.dev",
      membership: { id: "membership-priya", isProjectAdmin: false, roles: [role("No access")] }
    },
    {
      type: "user",
      id: "u-diego",
      name: "Diego Alvarez",
      email: "diego@acme.dev",
      membership: { id: "membership-diego", isProjectAdmin: false, roles: [role("Viewer")] }
    },
    {
      type: "identity",
      id: "9d27a4f1-0c3b-4e8a-b5f2-6a1d7c4e2b90",
      name: "k8s-payments-api",
      membership: { id: "membership-k8s", isProjectAdmin: false, roles: [role("Viewer")] }
    },
    {
      type: "user",
      id: "demo-user-jordan",
      name: "Jordan Lee",
      email: "jordan@acme.dev",
      membership: { id: "membership-jordan", isProjectAdmin: false, roles: [role("No access")] }
    },
    {
      type: "identity",
      id: "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11",
      name: "ci-deployer",
      membership: { id: "membership-ci", isProjectAdmin: false, roles: [role("No access")] }
    }
  ],
  grants: memberGrants
});
