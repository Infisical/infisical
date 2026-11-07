import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type {
  ClientSecretData,
  Identity,
  IdentityAccessToken,
  IdentityAwsAuth,
  IdentityKubernetesAuth,
  IdentityOidcAuth,
  IdentityTokenAuth,
  IdentityUniversalAuth
} from "@app/hooks/api/identities/types";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/hooks/api/identities/types";
import {
  type IdentityAuthTemplate,
  MachineIdentityAuthMethod
} from "@app/hooks/api/identityAuthTemplates/types";
import { ProjectType, ProjectUserMembershipTemporaryMode } from "@app/hooks/api/projects/types";
import type { TOrgRole, TProjectRole } from "@app/hooks/api/roles/types";
import type { ServiceToken } from "@app/hooks/api/serviceTokens/types";
import { AuthMethod } from "@app/hooks/api/users/types";

import { V4_DEMO_ORG_ID } from "../../mode";

export type DemoUser = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  superAdmin: boolean;
  isEmailVerified: boolean;
};

export type DemoOrgMembership = {
  id: string;
  userId: string;
  role: string;
  roleId: string;
  status: "invited" | "accepted" | "verified" | "completed";
  isActive: boolean;
  lastLoginAuthMethod?: AuthMethod;
  lastLoginTime?: string;
  metadata: { id: string; key: string; value: string }[];
  createdAt: string;
};

export type DemoGroup = {
  id: string;
  name: string;
  slug: string;
  role: string;
  roleId: string;
  createdAt: string;
};

export type DemoGroupMember = { groupId: string; joinedGroupAt: string } & (
  | { userId: string; identityId?: undefined }
  | { identityId: string; userId?: undefined }
);

export type DemoIdentityOrgMembership = {
  id: string;
  identityId: string;
  role: string;
  roleId?: string;
  lastLoginAuthMethod?: IdentityAuthMethod;
  lastLoginTime?: string;
  createdAt: string;
};

export type DemoRoleGrant = {
  id: string;
  role: string;
  isTemporary: boolean;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  temporaryAccessEndTime?: string;
};

export type DemoProjectMembership = {
  id: string;
  projectId: string;
  roles: DemoRoleGrant[];
  createdAt: string;
} & (
  | { kind: "user"; userId: string }
  | { kind: "identity"; identityId: string; lastLoginTime?: string }
  | { kind: "group"; groupId: string }
);

export type DemoProject = {
  id: string;
  name: string;
  type: ProjectType;
  environments: { id: string; name: string; slug: string }[];
};

export type AccessState = {
  defaultMembershipRole: string;
  users: DemoUser[];
  orgMemberships: DemoOrgMembership[];
  orgRoles: TOrgRole[];
  groups: DemoGroup[];
  groupMembers: DemoGroupMember[];
  identities: Identity[];
  identityOrgMemberships: DemoIdentityOrgMembership[];
  universalAuth: Record<string, IdentityUniversalAuth>;
  clientSecrets: Record<string, ClientSecretData[]>;
  authTemplates: IdentityAuthTemplate[];
  templateUsages: Record<string, string[]>;
  projects: DemoProject[];
  projectRoles: TProjectRole[];
  projectMemberships: DemoProjectMembership[];
  tokenAuthTokens: Record<string, IdentityAccessToken[]>;
  serviceTokens: ServiceToken[];
};

export const DEMO_SELF_USER_ID = "u-sarah";

const now = Date.now();
const hours = (h: number) => new Date(now + h * 3_600_000).toISOString();
const day = (iso: string) => `${iso}T12:00:00.000Z`;

const user = (
  id: string,
  firstName: string,
  lastName: string,
  email: string,
  superAdmin = false
): DemoUser => ({
  id,
  username: email,
  email,
  firstName,
  lastName,
  superAdmin,
  isEmailVerified: Boolean(firstName)
});

const users: DemoUser[] = [
  user("u-sarah", "Sarah", "Lin", "sarah@acme.dev", true),
  user("u-marcus", "Marcus", "Webb", "marcus@acme.dev"),
  user("u-priya", "Priya", "Raman", "priya@acme.dev"),
  user("u-diego", "Diego", "Alvarez", "diego@acme.dev"),
  user("u-hana", "Hana", "Kim", "hana@acme.dev"),
  user("u-tom", "Tom", "Becker", "tom@acme.dev"),
  user("u-lena", "Lena", "Novak", "lena@acme.dev"),
  user("u-omar", "", "", "omar@acme.dev"),
  user("u-julia", "", "", "julia@acme.dev"),
  user("u-kenji", "Kenji", "Watanabe", "kenji.watanabe@contractors.acme-partners.example")
];

const orgRole = (
  id: string,
  slug: string,
  name: string,
  description: string,
  permissions: TOrgRole["permissions"]
): TOrgRole => ({
  id,
  slug,
  name,
  description,
  orgId: V4_DEMO_ORG_ID,
  createdAt: day("2025-01-04"),
  updatedAt: day("2025-01-04"),
  permissions
});

const orgSubjects = [
  "workspace",
  "role",
  "member",
  "settings",
  "incident-contact",
  "sso",
  "scim",
  "ldap",
  "groups",
  "billing",
  "identity",
  "kms",
  "audit-logs",
  "project-templates",
  "app-connections",
  "machine-identity-auth-template",
  "secret-scanning"
];

const orgRoles: TOrgRole[] = [
  orgRole(
    "r-admin",
    "admin",
    "Admin",
    "Full administrative access over an organization",
    orgSubjects.map((subject) => ({ subject, action: ["read", "create", "edit", "delete"] }))
  ),
  orgRole("r-member", "member", "Member", "Limited read/write role in an organization", [
    { subject: "member", action: ["read"] },
    { subject: "role", action: ["read"] },
    { subject: "settings", action: ["read"] },
    { subject: "identity", action: ["read"] },
    { subject: "groups", action: ["read"] },
    { subject: "app-connections", action: ["read", "connect"] },
    { subject: "workspace", action: ["create"] }
  ]),
  orgRole(
    "r-no-access",
    "no-access",
    "No Access",
    "No access to any resources in the organization",
    []
  ),
  orgRole(
    "r-auditor",
    "security-auditor",
    "Security auditor",
    "Reads audit logs, members and identities",
    [
      { subject: "member", action: ["read"] },
      { subject: "audit-logs", action: ["read"] },
      { subject: "identity", action: ["read"] },
      { subject: "groups", action: ["read"] }
    ]
  ),
  orgRole(
    "r-release",
    "release-manager",
    "Release manager",
    "Creates projects and manages machine identities for deploys",
    [
      { subject: "member", action: ["read"] },
      { subject: "identity", action: ["read", "create", "edit"] },
      { subject: "groups", action: ["read"] },
      { subject: "workspace", action: ["create"] }
    ]
  )
];

const builtInOrgRoles = new Set(["admin", "member", "no-access"]);
const orgRoleRef = (slug: string) => {
  const found = orgRoles.find((role) => role.slug === slug)!;
  return { role: builtInOrgRoles.has(slug) ? slug : "custom", roleId: found.id };
};

const membership = (
  id: string,
  userId: string,
  roleSlug: string,
  createdAt: string,
  extra: Partial<DemoOrgMembership> = {}
): DemoOrgMembership => ({
  id,
  userId,
  ...orgRoleRef(roleSlug),
  status: "accepted",
  isActive: true,
  metadata: [],
  createdAt: day(createdAt),
  ...extra
});

const orgMemberships: DemoOrgMembership[] = [
  membership("m-sarah", "u-sarah", "admin", "2025-01-04", {
    lastLoginAuthMethod: AuthMethod.EMAIL,
    lastLoginTime: "2026-10-30T16:12:00.000Z"
  }),
  membership("m-marcus", "u-marcus", "admin", "2025-02-11", {
    lastLoginAuthMethod: AuthMethod.GOOGLE,
    lastLoginTime: "2026-10-30T01:40:00.000Z"
  }),
  membership("m-priya", "u-priya", "member", "2025-03-02", {
    lastLoginAuthMethod: AuthMethod.EMAIL,
    lastLoginTime: "2026-10-28T18:03:00.000Z",
    metadata: [{ id: "md-priya-team", key: "team", value: "payments" }]
  }),
  membership("m-diego", "u-diego", "member", "2025-04-19"),
  membership("m-hana", "u-hana", "security-auditor", "2025-05-07", {
    lastLoginAuthMethod: AuthMethod.OKTA_SAML,
    lastLoginTime: "2026-10-27T22:55:00.000Z"
  }),
  membership("m-tom", "u-tom", "release-manager", "2025-06-23"),
  membership("m-lena", "u-lena", "no-access", "2025-08-14", { isActive: false }),
  membership("m-omar", "u-omar", "member", "2026-10-29", { status: "invited" }),
  membership("m-julia", "u-julia", "member", "2026-10-30", { status: "invited" })
];

const group = (id: string, name: string, roleSlug: string, createdAt: string): DemoGroup => ({
  id,
  name,
  slug: name,
  ...orgRoleRef(roleSlug),
  createdAt: day(createdAt)
});

const groups: DemoGroup[] = [
  group("g-platform", "platform-eng", "admin", "2025-02-01"),
  group("g-security", "security", "security-auditor", "2025-05-07"),
  group("g-contractors", "contractors", "member", "2026-09-03")
];

const CI_DEPLOYER = "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11";
const K8S_PAYMENTS = "9d27a4f1-0c3b-4e8a-b5f2-6a1d7c4e2b90";
const TERRAFORM = "1f6c3e9b-7a24-4d0e-8b51-c2e9a7d40f36";
const WEBHOOK_RELAY = "a3f09c6e-41d2-4b7a-9e58-2c6d0b8f1e43";

const groupMembers: DemoGroupMember[] = [
  { groupId: "g-platform", userId: "u-sarah", joinedGroupAt: day("2025-02-01") },
  { groupId: "g-platform", userId: "u-marcus", joinedGroupAt: day("2025-02-11") },
  { groupId: "g-platform", userId: "u-priya", joinedGroupAt: day("2025-03-02") },
  { groupId: "g-platform", identityId: CI_DEPLOYER, joinedGroupAt: day("2026-03-04") },
  { groupId: "g-security", userId: "u-marcus", joinedGroupAt: day("2025-05-07") },
  { groupId: "g-security", userId: "u-hana", joinedGroupAt: day("2025-05-07") },
  { groupId: "g-contractors", userId: "u-kenji", joinedGroupAt: day("2026-09-03") }
];

const identity = (
  id: string,
  name: string,
  createdAt: string,
  authMethods: IdentityAuthMethod[],
  extra: Partial<Identity> = {}
): Identity => ({
  id,
  name,
  hasDeleteProtection: false,
  authMethods,
  activeLockoutAuthMethods: [],
  createdAt: day(createdAt),
  updatedAt: day(createdAt),
  orgId: V4_DEMO_ORG_ID,
  projectId: null,
  metadata: [],
  ...extra
});

const identities: Identity[] = [
  identity(
    CI_DEPLOYER,
    "ci-deployer",
    "2026-03-04",
    [IdentityAuthMethod.UNIVERSAL_AUTH, IdentityAuthMethod.OIDC_AUTH],
    {
      hasDeleteProtection: true,
      activeLockoutAuthMethods: [IdentityAuthMethod.UNIVERSAL_AUTH],
      metadata: [
        { id: "md-ci-team", key: "team", value: "platform" },
        { id: "md-ci-runner", key: "runner", value: "github-actions" }
      ]
    }
  ),
  identity(
    K8S_PAYMENTS,
    "k8s-payments-api",
    "2026-01-22",
    [IdentityAuthMethod.KUBERNETES_AUTH, IdentityAuthMethod.UNIVERSAL_AUTH],
    { hasDeleteProtection: true, metadata: [{ id: "md-k8s-team", key: "team", value: "payments" }] }
  ),
  identity(TERRAFORM, "terraform-runner", "2025-11-30", [IdentityAuthMethod.UNIVERSAL_AUTH], {
    metadata: [{ id: "md-tf-team", key: "team", value: "platform" }]
  }),
  identity("c83b5d07-2e91-4f6a-9c4d-8b0f1e7a5d22", "vercel-preview-sync", "2026-05-12", [
    IdentityAuthMethod.TOKEN_AUTH
  ]),
  identity("e5a90f4c-6b17-4c3d-a2e8-3d9c0b6f1a74", "backup-signer", "2026-06-02", [
    IdentityAuthMethod.AWS_AUTH
  ]),
  identity("7b2d6e81-5f3a-4b9c-8e07-1a4c9d2f6b58", "cert-renewer", "2026-10-20", []),
  identity(
    WEBHOOK_RELAY,
    "payments-webhook-relay",
    "2026-09-14",
    [IdentityAuthMethod.UNIVERSAL_AUTH],
    {
      hasDeleteProtection: true,
      projectId: "payments-api",
      metadata: [{ id: "md-relay-service", key: "service", value: "webhooks" }]
    }
  )
];

const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const identityOrgMembership = (
  identityId: string,
  roleSlug: string,
  lastLoginMinutesAgo?: number,
  lastLoginAuthMethod = IdentityAuthMethod.UNIVERSAL_AUTH
): DemoIdentityOrgMembership => {
  const ref = orgRoleRef(roleSlug);
  return {
    id: `iom-${identityId.slice(0, 8)}`,
    identityId,
    role: ref.role,
    roleId: ref.role === "custom" ? ref.roleId : undefined,
    lastLoginAuthMethod: lastLoginMinutesAgo === undefined ? undefined : lastLoginAuthMethod,
    lastLoginTime: lastLoginMinutesAgo === undefined ? undefined : minutesAgo(lastLoginMinutesAgo),
    createdAt: identities.find((entry) => entry.id === identityId)!.createdAt
  };
};

const identityOrgMemberships: DemoIdentityOrgMembership[] = [
  identityOrgMembership(CI_DEPLOYER, "member", 4),
  identityOrgMembership(K8S_PAYMENTS, "no-access", 12, IdentityAuthMethod.KUBERNETES_AUTH),
  identityOrgMembership(TERRAFORM, "admin", 120),
  identityOrgMembership(
    "c83b5d07-2e91-4f6a-9c4d-8b0f1e7a5d22",
    "member",
    3 * 1440,
    IdentityAuthMethod.TOKEN_AUTH
  ),
  identityOrgMembership(
    "e5a90f4c-6b17-4c3d-a2e8-3d9c0b6f1a74",
    "member",
    1440,
    IdentityAuthMethod.AWS_AUTH
  ),
  identityOrgMembership("7b2d6e81-5f3a-4b9c-8e07-1a4c9d2f6b58", "member")
];

const ip = (ipAddress: string, type: "ipv4" | "ipv6", prefix: number) => ({
  id: crypto.randomUUID(),
  ipAddress,
  type,
  prefix
});

export const defaultUniversalAuth = (identityId: string): IdentityUniversalAuth => ({
  identityId,
  clientId: identityId.split("-").reverse().join("-"),
  clientSecretTrustedIps: [ip("0.0.0.0", "ipv4", 0), ip("::", "ipv6", 0)],
  accessTokenTrustedIps: [ip("0.0.0.0", "ipv4", 0), ip("::", "ipv6", 0)],
  accessTokenTTL: 2592000,
  accessTokenMaxTTL: 2592000,
  accessTokenNumUsesLimit: 0,
  accessTokenPeriod: 0,
  lockoutEnabled: true,
  lockoutThreshold: 3,
  lockoutDurationSeconds: 300,
  lockoutCounterResetSeconds: 30
});

const universalAuth = Object.fromEntries(
  identities
    .filter((entry) => entry.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH))
    .map((entry) => [entry.id, defaultUniversalAuth(entry.id)])
);

const clientSecrets: Record<string, ClientSecretData[]> = {
  [CI_DEPLOYER]: [
    {
      id: "cs-ci-1",
      identityUniversalAuth: CI_DEPLOYER,
      isClientSecretRevoked: false,
      description: "GitHub Actions",
      clientSecretPrefix: "3f9a",
      clientSecretNumUses: 412,
      clientSecretNumUsesLimit: 0,
      clientSecretTTL: 0,
      createdAt: day("2026-03-04"),
      updatedAt: day("2026-03-04")
    }
  ]
};

const accessTokenDefaults = (identityId: string) => ({
  identityId,
  accessTokenTTL: 2592000,
  accessTokenMaxTTL: 2592000,
  accessTokenNumUsesLimit: 0,
  accessTokenTrustedIps: [ip("0.0.0.0", "ipv4", 0), ip("::", "ipv6", 0)]
});

export const defaultTokenAuth = (identityId: string): IdentityTokenAuth =>
  accessTokenDefaults(identityId);

export const defaultKubernetesAuth = (identityId: string): IdentityKubernetesAuth => ({
  ...accessTokenDefaults(identityId),
  kubernetesHost: "https://k8s.prod.acme.dev:6443",
  tokenReviewerJwt: "",
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
  allowedNamespaces: "payments, payments-canary",
  allowedNames: "payments-api, payments-worker",
  allowedAudience: "",
  caCert: "",
  verifyTlsCertificate: true,
  templateId: "t-k8s"
});

export const defaultAwsAuth = (identityId: string): IdentityAwsAuth => ({
  ...accessTokenDefaults(identityId),
  type: "iam",
  stsEndpoint: "https://sts.amazonaws.com/",
  allowedPrincipalArns: "arn:aws:iam::441700233914:role/backup",
  allowedAccountIds: "441700233914"
});

export const defaultOidcAuth = (identityId: string): IdentityOidcAuth => ({
  ...accessTokenDefaults(identityId),
  templateId: "t-oidc",
  oidcDiscoveryUrl: "https://token.actions.githubusercontent.com",
  caCert: "",
  boundIssuer: "https://token.actions.githubusercontent.com",
  boundAudiences: "https://github.com/acme",
  boundClaims: {},
  boundSubject: "repo:acme/*:ref:refs/heads/main"
});

const tokenAuthToken = (
  id: string,
  identityId: string,
  name: string,
  createdAt: string,
  accessTokenTTL: number
): IdentityAccessToken => ({
  id,
  name,
  identityId,
  accessTokenTTL,
  accessTokenMaxTTL: accessTokenTTL,
  accessTokenNumUses: 0,
  accessTokenNumUsesLimit: 0,
  accessTokenLastUsedAt: null,
  accessTokenLastRenewedAt: null,
  isAccessTokenRevoked: false,
  identityUAClientSecretId: null,
  createdAt: day(createdAt),
  updatedAt: day(createdAt)
});

const tokenAuthTokens: Record<string, IdentityAccessToken[]> = {
  "c83b5d07-2e91-4f6a-9c4d-8b0f1e7a5d22": [
    tokenAuthToken(
      "tat-preview",
      "c83b5d07-2e91-4f6a-9c4d-8b0f1e7a5d22",
      "preview-builds",
      "2026-10-20",
      2592000
    ),
    tokenAuthToken(
      "tat-prod",
      "c83b5d07-2e91-4f6a-9c4d-8b0f1e7a5d22",
      "production-sync",
      "2026-05-12",
      0
    )
  ]
};

const authTemplates: IdentityAuthTemplate[] = [
  {
    id: "t-ldap",
    name: "corp-ldap",
    authMethod: MachineIdentityAuthMethod.LDAP,
    organizationId: V4_DEMO_ORG_ID,
    templateFields: {
      url: "ldaps://ldap.acme.dev:636",
      bindDN: "cn=infisical,ou=services,dc=acme,dc=dev",
      bindPass: "",
      hasBindPass: true,
      searchBase: "ou=services,dc=acme,dc=dev"
    },
    createdAt: day("2026-02-10"),
    updatedAt: day("2026-02-10")
  },
  {
    id: "t-k8s",
    name: "prod-cluster",
    authMethod: MachineIdentityAuthMethod.KUBERNETES,
    organizationId: V4_DEMO_ORG_ID,
    templateFields: {
      tokenReviewMode: IdentityKubernetesAuthTokenReviewMode.Api,
      kubernetesHost: "https://k8s.prod.acme.dev:6443",
      hasTokenReviewerJwt: true
    },
    createdAt: day("2026-01-20"),
    updatedAt: day("2026-01-20")
  },
  {
    id: "t-oidc",
    name: "github-actions-oidc",
    authMethod: MachineIdentityAuthMethod.OIDC,
    organizationId: V4_DEMO_ORG_ID,
    templateFields: {
      oidcDiscoveryUrl: "https://token.actions.githubusercontent.com",
      boundIssuer: "https://token.actions.githubusercontent.com"
    },
    createdAt: day("2026-03-01"),
    updatedAt: day("2026-03-01")
  }
];

const env = (projectId: string, slug: string, name: string) => ({
  id: `${projectId}-${slug}`,
  slug,
  name
});
const standardEnvironments = (projectId: string) => [
  env(projectId, "dev", "Development"),
  env(projectId, "staging", "Staging"),
  env(projectId, "prod", "Production")
];

const projects: DemoProject[] = [
  {
    id: "payments-api",
    name: "payments-api",
    type: ProjectType.SecretManager,
    environments: standardEnvironments("payments-api")
  },
  {
    id: "web-dashboard",
    name: "web-dashboard",
    type: ProjectType.SecretManager,
    environments: standardEnvironments("web-dashboard")
  },
  {
    id: "platform-core",
    name: "platform-core",
    type: ProjectType.SecretManager,
    environments: standardEnvironments("platform-core")
  },
  { id: "kms-keys", name: "kms-keys", type: ProjectType.KMS, environments: [] },
  { id: "edge-signing", name: "edge-signing", type: ProjectType.KMS, environments: [] },
  {
    id: "internal-pki",
    name: "internal-pki",
    type: ProjectType.CertificateManager,
    environments: []
  }
];

const secretSubjects = [
  "secrets",
  "secret-folders",
  "secret-imports",
  "dynamic-secrets",
  "secret-rotation",
  "secret-syncs",
  "environments",
  "integrations",
  "tags",
  "webhooks",
  "service-tokens",
  "member",
  "groups",
  "identity",
  "role",
  "settings",
  "audit-logs",
  "commits"
];
const crud = ["read", "create", "edit", "delete"];

const projectRole = (
  id: string,
  slug: string,
  name: string,
  description: string,
  permissions: TProjectRole["permissions"]
): TProjectRole => ({
  id,
  slug,
  name,
  description,
  projectId: "payments-api",
  createdAt: day("2025-01-04"),
  updatedAt: day("2025-01-04"),
  permissions
});

const projectRoles: TProjectRole[] = [
  projectRole(
    "p-admin",
    "admin",
    "Admin",
    "Full administrative access over a project",
    secretSubjects.map((subject) => ({
      subject,
      action: subject === "secrets" ? ["describeSecret", "readValue", ...crud.slice(1)] : crud
    }))
  ),
  projectRole("p-member", "member", "Member", "Limited read/write role in a project", [
    { subject: "secrets", action: ["describeSecret", "readValue", "create", "edit", "delete"] },
    { subject: "secret-folders", action: ["create", "edit", "delete"] },
    { subject: "secret-imports", action: crud },
    { subject: "tags", action: crud },
    ...["environments", "integrations", "webhooks", "member", "groups", "identity", "role"].map(
      (subject) => ({ subject, action: ["read"] })
    )
  ]),
  projectRole(
    "p-viewer",
    "viewer",
    "Viewer",
    "Only read role in a project",
    ["secrets", "secret-folders", "secret-imports", "environments", "tags", "member", "role"].map(
      (subject) => ({
        subject,
        action: subject === "secrets" ? ["describeSecret", "readValue"] : ["read"]
      })
    )
  ),
  projectRole(
    "p-no-access",
    "no-access",
    "No Access",
    "No access to any resources in the project",
    []
  ),
  projectRole(
    "p-deploy-reviewer",
    "deploy-bot-reviewer",
    "Deploy bot reviewer",
    "Reviews production API secrets used by the deploy bot",
    [
      {
        subject: "secrets",
        action: ["describeSecret", "readValue"],
        conditions: { environment: { $eq: "prod" }, secretPath: { $glob: "/api/**" } }
      },
      {
        subject: "secrets",
        action: ["edit"],
        conditions: { environment: { $eq: "staging" }, secretPath: { $glob: "/api/**" } }
      },
      { subject: "environments", action: ["read"] }
    ]
  ),
  projectRole(
    "p-platform-operator",
    "platform-operator",
    "Platform operator",
    "Runs day-to-day secret operations, without PCI production values",
    [
      { subject: "secrets", action: ["describeSecret", "readValue", "create", "edit", "delete"] },
      {
        subject: "secrets",
        action: ["readValue"],
        inverted: true,
        conditions: { environment: { $eq: "prod" }, secretPath: { $glob: "/pci/**" } }
      },
      {
        subject: "secret-folders",
        action: ["create", "edit", "delete"],
        conditions: { environment: { $ne: "prod" } }
      },
      { subject: "secret-imports", action: ["read", "create"] },
      { subject: "dynamic-secrets", action: ["lease"] },
      {
        subject: "dynamic-secrets",
        action: ["read-root-credential"],
        conditions: { environment: { $eq: "staging" } }
      },
      { subject: "environments", action: ["read", "create", "edit"] },
      { subject: "integrations", action: ["read"] },
      {
        subject: "secret-syncs",
        action: ["read", "sync-secrets"],
        conditions: { environment: { $in: ["dev", "staging"] } }
      },
      { subject: "secret-rotation", action: ["read", "rotate-secrets"] },
      { subject: "tags", action: crud },
      { subject: "webhooks", action: ["read", "create"] },
      { subject: "service-tokens", action: ["read"] },
      { subject: "audit-logs", action: ["read"] },
      { subject: "member", action: ["read"] },
      { subject: "commits", action: ["read"] }
    ]
  )
];

const grant = (
  id: string,
  role: string,
  temporary?: { range: string; from: number; to: number }
) =>
  temporary
    ? {
        id,
        role,
        isTemporary: true,
        temporaryRange: temporary.range,
        temporaryAccessStartTime: hours(temporary.from),
        temporaryAccessEndTime: hours(temporary.to)
      }
    : { id, role, isTemporary: false };

const projectMemberships: DemoProjectMembership[] = [
  {
    kind: "user",
    id: "pm-sarah",
    projectId: "payments-api",
    userId: "u-sarah",
    roles: [grant("pr-1", "admin")],
    createdAt: day("2025-01-04")
  },
  {
    kind: "user",
    id: "pm-marcus",
    projectId: "payments-api",
    userId: "u-marcus",
    roles: [grant("pr-2", "admin")],
    createdAt: day("2025-02-11")
  },
  {
    kind: "user",
    id: "pm-priya",
    projectId: "payments-api",
    userId: "u-priya",
    roles: [grant("pr-3", "member")],
    createdAt: day("2025-03-02")
  },
  {
    kind: "user",
    id: "pm-diego",
    projectId: "payments-api",
    userId: "u-diego",
    roles: [
      grant("pr-4", "viewer"),
      grant("pr-5", "member", { range: "7d", from: -48, to: 120 }),
      grant("pr-6", "deploy-bot-reviewer", { range: "1d", from: -72, to: -48 })
    ],
    createdAt: day("2025-04-19")
  },
  {
    kind: "user",
    id: "pm-hana",
    projectId: "payments-api",
    userId: "u-hana",
    roles: [grant("pr-7", "deploy-bot-reviewer")],
    createdAt: day("2025-05-07")
  },
  {
    kind: "user",
    id: "pm-omar",
    projectId: "payments-api",
    userId: "u-omar",
    roles: [grant("pr-8", "viewer")],
    createdAt: day("2026-10-29")
  },
  {
    kind: "user",
    id: "opm-1",
    projectId: "web-dashboard",
    userId: "u-priya",
    roles: [grant("pr-9", "member")],
    createdAt: day("2025-04-02")
  },
  {
    kind: "user",
    id: "opm-2",
    projectId: "platform-core",
    userId: "u-priya",
    roles: [grant("pr-10", "viewer"), grant("pr-11", "member")],
    createdAt: day("2025-06-18")
  },
  {
    kind: "user",
    id: "opm-3",
    projectId: "internal-pki",
    userId: "u-priya",
    roles: [grant("pr-12", "admin")],
    createdAt: day("2025-07-01")
  },
  {
    kind: "group",
    id: "pg-platform",
    projectId: "payments-api",
    groupId: "g-platform",
    roles: [grant("pg-1", "member")],
    createdAt: day("2025-02-01")
  },
  {
    kind: "group",
    id: "pg-security",
    projectId: "payments-api",
    groupId: "g-security",
    roles: [
      grant("pg-2", "viewer"),
      grant("pg-3", "deploy-bot-reviewer", { range: "30d", from: -24, to: 696 })
    ],
    createdAt: day("2025-05-07")
  },
  {
    kind: "group",
    id: "opm-5",
    projectId: "platform-core",
    groupId: "g-platform",
    roles: [grant("pg-4", "admin")],
    createdAt: day("2025-02-03")
  },
  {
    kind: "identity",
    id: "pi-ci",
    projectId: "payments-api",
    identityId: CI_DEPLOYER,
    roles: [grant("pi-1", "member")],
    createdAt: day("2026-03-04"),
    lastLoginTime: minutesAgo(4)
  },
  {
    kind: "identity",
    id: "pi-k8s",
    projectId: "payments-api",
    identityId: K8S_PAYMENTS,
    roles: [grant("pi-2", "viewer")],
    createdAt: day("2026-01-22"),
    lastLoginTime: minutesAgo(12)
  },
  {
    kind: "identity",
    id: "pi-tf",
    projectId: "payments-api",
    identityId: TERRAFORM,
    roles: [grant("pi-3", "admin")],
    createdAt: day("2025-11-30"),
    lastLoginTime: minutesAgo(120)
  },
  {
    kind: "identity",
    id: "pi-relay",
    projectId: "payments-api",
    identityId: WEBHOOK_RELAY,
    roles: [grant("pi-4", "member")],
    createdAt: day("2026-09-14"),
    lastLoginTime: minutesAgo(25)
  },
  {
    kind: "identity",
    id: "opm-4",
    projectId: "kms-keys",
    identityId: CI_DEPLOYER,
    roles: [grant("pi-5", "admin")],
    createdAt: day("2026-03-09")
  },
  {
    kind: "user",
    id: "kpm-sarah",
    projectId: "kms-keys",
    userId: "u-sarah",
    roles: [grant("kpr-1", "admin")],
    createdAt: day("2025-03-14")
  },
  {
    kind: "user",
    id: "kpm-marcus",
    projectId: "kms-keys",
    userId: "u-marcus",
    roles: [grant("kpr-2", "member")],
    createdAt: day("2025-06-02")
  },
  {
    kind: "user",
    id: "kpm-priya",
    projectId: "kms-keys",
    userId: "u-priya",
    roles: [grant("kpr-3", "viewer")],
    createdAt: day("2026-01-15")
  },
  {
    kind: "group",
    id: "kpg-security",
    projectId: "kms-keys",
    groupId: "g-security",
    roles: [grant("kpg-1", "viewer")],
    createdAt: day("2025-08-21")
  },
  {
    kind: "user",
    id: "kpm-sarah-edge",
    projectId: "edge-signing",
    userId: "u-sarah",
    roles: [grant("kpr-4", "admin")],
    createdAt: day("2026-04-22")
  }
];

const serviceToken = (
  id: string,
  name: string,
  scopes: ServiceToken["scopes"],
  createdAt: string,
  expiresAt: string | null
): ServiceToken => ({
  id,
  name,
  projectId: "payments-api",
  scopes,
  user: "u-sarah",
  expiresAt: expiresAt as string,
  createdAt: day(createdAt),
  updatedAt: day(createdAt),
  __v: 0
});

const serviceTokens: ServiceToken[] = [
  serviceToken(
    "st-1",
    "legacy-ci-read",
    [{ environment: "prod", secretPath: "/" }],
    "2025-02-03",
    null
  ),
  serviceToken(
    "st-2",
    "staging-sync",
    [{ environment: "staging", secretPath: "/api" }],
    "2026-09-09",
    day("2026-11-30")
  )
];

export const seedAccessState = (): AccessState => ({
  defaultMembershipRole: "member",
  users,
  orgMemberships,
  orgRoles,
  groups,
  groupMembers,
  identities,
  identityOrgMemberships,
  universalAuth,
  clientSecrets,
  authTemplates,
  templateUsages: { "t-k8s": [K8S_PAYMENTS], "t-oidc": [CI_DEPLOYER] },
  projects,
  projectRoles,
  projectMemberships,
  tokenAuthTokens,
  serviceTokens
});

export const seedEmptyAccessState = (): AccessState => {
  const seed = seedAccessState();
  return {
    ...seed,
    users: seed.users.filter((entry) => entry.id === DEMO_SELF_USER_ID),
    orgMemberships: seed.orgMemberships.filter((entry) => entry.userId === DEMO_SELF_USER_ID),
    orgRoles: seed.orgRoles.filter((role) => builtInOrgRoles.has(role.slug)),
    groups: [],
    groupMembers: [],
    identities: [],
    identityOrgMemberships: [],
    universalAuth: {},
    clientSecrets: {},
    authTemplates: [],
    templateUsages: {},
    projectRoles: seed.projectRoles.filter((role) =>
      ["admin", "member", "viewer", "no-access"].includes(role.slug)
    ),
    projectMemberships: seed.projectMemberships.filter(
      (entry) => entry.kind === "user" && entry.userId === DEMO_SELF_USER_ID
    ),
    tokenAuthTokens: {},
    serviceTokens: []
  };
};

export const TEMPORARY_MODE = ProjectUserMembershipTemporaryMode.Relative;

export const DEMO_PROJECT_TAGS = [
  {
    id: "tag-api",
    slug: "api",
    color: "",
    createdAt: day("2025-01-04"),
    updatedAt: day("2025-01-04"),
    __v: 0
  },
  {
    id: "tag-billing",
    slug: "billing",
    color: "",
    createdAt: day("2025-01-04"),
    updatedAt: day("2025-01-04"),
    __v: 0
  },
  {
    id: "tag-pci",
    slug: "pci",
    color: "",
    createdAt: day("2025-01-04"),
    updatedAt: day("2025-01-04"),
    __v: 0
  }
];

export const DEMO_VAULT_CONNECTIONS = [{ id: "vc-prod", name: "vault-prod" }];

export const DEMO_VAULT_NAMESPACES: Record<
  string,
  {
    mounts: { path: string; type: string; version: string | null }[];
    policies: { name: string; rules: string }[];
  }
> = {
  "/": {
    mounts: [
      { path: "secret/", type: "kv", version: "2" },
      { path: "kv-legacy/", type: "kv", version: "1" }
    ],
    policies: [
      {
        name: "payments-read",
        rules: [
          "# Payments service reads production config",
          'path "secret/data/prod/payments/*" {',
          '  capabilities = ["read", "list"]',
          "}",
          "",
          'path "secret/metadata/prod/payments/*" {',
          '  capabilities = ["list"]',
          "}",
          ""
        ].join("\n")
      },
      {
        name: "ci-deployer",
        rules: [
          'path "secret/data/staging/*" {',
          '  capabilities = ["create", "read", "update", "delete"]',
          "}",
          "",
          'path "secret/metadata/staging/*" {',
          '  capabilities = ["create", "delete"]',
          "}",
          "",
          'path "sys/policies/acl/*" {',
          '  capabilities = ["read"]',
          "}",
          ""
        ].join("\n")
      }
    ]
  },
  platform: {
    mounts: [{ path: "secret/", type: "kv", version: "2" }],
    policies: [
      {
        name: "platform-admin",
        rules: [
          'path "secret/data/*" {',
          '  capabilities = ["create", "read", "update", "delete", "list"]',
          "}",
          ""
        ].join("\n")
      }
    ]
  }
};
