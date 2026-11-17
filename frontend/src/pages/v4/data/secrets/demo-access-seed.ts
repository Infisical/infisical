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

export const seedFolderAccess = (): DemoFolderAccess => ({
  actors: [
    {
      type: "user",
      id: "demo-user-sarah",
      name: "Sarah Lin",
      email: "sarah@acme.dev",
      membership: { id: "membership-sarah", isProjectAdmin: true, roles: [role("Admin")] }
    },
    {
      type: "user",
      id: "demo-user-marcus",
      name: "Marcus Webb",
      email: "marcus@acme.dev",
      membership: { id: "membership-marcus", isProjectAdmin: false, roles: [role("Developer")] }
    },
    {
      type: "user",
      id: "demo-user-priya",
      name: "Priya Natarajan",
      email: "priya@acme.dev",
      membership: { id: "membership-priya", isProjectAdmin: false, roles: [role("No access")] }
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
      id: "demo-identity-ci",
      name: "payments-ci",
      membership: { id: "membership-ci", isProjectAdmin: false, roles: [role("No access")] }
    }
  ],
  grants: memberGrants
});
