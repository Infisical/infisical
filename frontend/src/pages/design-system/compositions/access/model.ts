import { type RolePermissions, seedRolePermissions } from "./roles/permissions-model";

export const LOCAL_ONLY = "Saved to local demo data only. No request was sent.";

export type Scope = "org" | "project";
export type OrgTab = "members" | "identities" | "groups" | "roles";
export type ProjectTab = "members" | "identities" | "groups" | "service-tokens" | "roles";

export type Scenario = "default" | "read-only" | "restricted" | "denied" | "empty" | "loading";
export const scenarios: { value: Scenario; label: string }[] = [
  { value: "default", label: "Admin with full access" },
  { value: "read-only", label: "Read only, actions disabled" },
  { value: "restricted", label: "No access to some tabs" },
  { value: "denied", label: "No access to any tab" },
  { value: "empty", label: "Empty organization and project" },
  { value: "loading", label: "Loading" }
];

export type RoleRef = { role: string };

export type Role = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  builtIn: boolean;
};

export const orgRoles: Role[] = [
  {
    id: "r-admin",
    slug: "admin",
    name: "Admin",
    builtIn: true,
    description: "Full administrative access over an organization"
  },
  {
    id: "r-member",
    slug: "member",
    name: "Member",
    builtIn: true,
    description: "Limited read/write role in an organization"
  },
  {
    id: "r-no-access",
    slug: "no-access",
    name: "No Access",
    builtIn: true,
    description: "No access to any resources in the organization"
  },
  {
    id: "r-auditor",
    slug: "security-auditor",
    name: "Security auditor",
    builtIn: false,
    description: "Reads audit logs, members and identities"
  },
  {
    id: "r-release",
    slug: "release-manager",
    name: "Release manager",
    builtIn: false,
    description: "Creates projects and manages machine identities for deploys"
  }
];
export const DEFAULT_ORG_ROLE = "member";

export const projectRoles: Role[] = [
  {
    id: "p-admin",
    slug: "admin",
    name: "Admin",
    builtIn: true,
    description: "Full administrative access over a project"
  },
  {
    id: "p-member",
    slug: "member",
    name: "Member",
    builtIn: true,
    description: "Limited read/write role in a project"
  },
  {
    id: "p-viewer",
    slug: "viewer",
    name: "Viewer",
    builtIn: true,
    description: "Only read role in a project"
  },
  {
    id: "p-no-access",
    slug: "no-access",
    name: "No Access",
    builtIn: true,
    description: "No access to any resources in the project"
  },
  {
    id: "p-deploy-reviewer",
    slug: "deploy-bot-reviewer",
    name: "Deploy bot reviewer",
    builtIn: false,
    description: "Reviews production API secrets used by the deploy bot"
  }
];

export type GroupRef = { id: string; name: string; roles: RoleRef[] };

export type OrgUser = {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  username: string;
  superAdmin?: boolean;
};

export type OrgMember = {
  user: OrgUser;
  membership?: {
    id: string;
    role: string;
    isActive: boolean;
    status: "invited" | "verified" | "accepted";
    lastLogin?: { method: string; time: string };
    createdAt: string;
    metadata?: { key: string; value: string }[];
  };
  groups: GroupRef[];
};

const user = (
  id: string,
  first: string | undefined,
  last: string | undefined,
  email: string
): OrgUser => ({
  id,
  firstName: first,
  lastName: last,
  email,
  username: email
});

export const SELF_USER_ID = "u-sarah";

export const orgMembers: OrgMember[] = [
  {
    user: { ...user("u-sarah", "Sarah", "Lin", "sarah@acme.dev"), superAdmin: true },
    membership: {
      id: "m-sarah",
      role: "admin",
      isActive: true,
      status: "accepted",
      lastLogin: { method: "Email", time: "Oct 30, 2026, 9:12 AM" },
      createdAt: "Jan 4, 2025"
    },
    groups: [{ id: "g-platform", name: "platform-eng", roles: [{ role: "admin" }] }]
  },
  {
    user: user("u-marcus", "Marcus", "Webb", "marcus@acme.dev"),
    membership: {
      id: "m-marcus",
      role: "admin",
      isActive: true,
      status: "accepted",
      lastLogin: { method: "Google SSO", time: "Oct 29, 2026, 6:40 PM" },
      createdAt: "Feb 11, 2025"
    },
    groups: [
      { id: "g-platform", name: "platform-eng", roles: [{ role: "admin" }] },
      { id: "g-security", name: "security", roles: [{ role: "security-auditor" }] }
    ]
  },
  {
    user: user("u-priya", "Priya", "Raman", "priya@acme.dev"),
    membership: {
      id: "m-priya",
      role: "member",
      isActive: true,
      status: "accepted",
      lastLogin: { method: "Email", time: "Oct 28, 2026, 11:03 AM" },
      createdAt: "Mar 2, 2025",
      metadata: [{ key: "team", value: "payments" }]
    },
    groups: [{ id: "g-platform", name: "platform-eng", roles: [{ role: "admin" }] }]
  },
  {
    user: user("u-diego", "Diego", "Alvarez", "diego@acme.dev"),
    membership: {
      id: "m-diego",
      role: "member",
      isActive: true,
      status: "accepted",
      createdAt: "Apr 19, 2025"
    },
    groups: []
  },
  {
    user: user("u-hana", "Hana", "Kim", "hana@acme.dev"),
    membership: {
      id: "m-hana",
      role: "security-auditor",
      isActive: true,
      status: "accepted",
      lastLogin: { method: "Okta SAML", time: "Oct 27, 2026, 3:55 PM" },
      createdAt: "May 7, 2025"
    },
    groups: [{ id: "g-security", name: "security", roles: [{ role: "security-auditor" }] }]
  },
  {
    user: user("u-tom", "Tom", "Becker", "tom@acme.dev"),
    membership: {
      id: "m-tom",
      role: "release-manager",
      isActive: true,
      status: "accepted",
      createdAt: "Jun 23, 2025"
    },
    groups: []
  },
  {
    user: user("u-lena", "Lena", "Novak", "lena@acme.dev"),
    membership: {
      id: "m-lena",
      role: "no-access",
      isActive: false,
      status: "accepted",
      createdAt: "Aug 14, 2025"
    },
    groups: []
  },
  {
    user: user("u-omar", undefined, undefined, "omar@acme.dev"),
    membership: {
      id: "m-omar",
      role: "member",
      isActive: true,
      status: "invited",
      createdAt: "Oct 29, 2026"
    },
    groups: []
  },
  {
    user: user("u-julia", undefined, undefined, "julia@acme.dev"),
    membership: {
      id: "m-julia",
      role: "member",
      isActive: true,
      status: "invited",
      createdAt: "Oct 30, 2026"
    },
    groups: []
  },
  {
    user: user("u-kenji", "Kenji", "Watanabe", "kenji.watanabe@contractors.acme-partners.example"),
    groups: [
      {
        id: "g-contractors",
        name: "contractors",
        roles: [{ role: "member" }, { role: "release-manager" }, { role: "security-auditor" }]
      }
    ]
  }
];

export type OrgGroup = {
  id: string;
  name: string;
  slug: string;
  role: string;
  memberIds: string[];
  identityIds?: string[];
  addedOn?: Record<string, string>;
  createdAt: string;
};

export const orgGroups: OrgGroup[] = [
  {
    id: "g-platform",
    name: "platform-eng",
    slug: "platform-eng",
    role: "admin",
    memberIds: ["u-sarah", "u-marcus", "u-priya"],
    identityIds: ["4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11"],
    createdAt: "Feb 1, 2025"
  },
  {
    id: "g-security",
    name: "security",
    slug: "security",
    role: "security-auditor",
    memberIds: ["u-marcus", "u-hana"],
    createdAt: "May 7, 2025"
  },
  {
    id: "g-contractors",
    name: "contractors",
    slug: "contractors",
    role: "member",
    memberIds: ["u-kenji"],
    createdAt: "Sep 3, 2026"
  }
];

export type AuthMethod =
  | "universal"
  | "kubernetes"
  | "token"
  | "aws"
  | "gcp"
  | "azure"
  | "oidc"
  | "jwt"
  | "ldap"
  | "tls-cert"
  | "oci"
  | "alicloud"
  | "spiffe";

export const authMethodNames: Record<AuthMethod, string> = {
  universal: "Universal Auth",
  kubernetes: "Kubernetes Auth",
  token: "Token Auth",
  aws: "AWS Auth",
  gcp: "GCP Auth",
  azure: "Azure Auth",
  oidc: "OIDC Auth",
  jwt: "JWT Auth",
  ldap: "LDAP Auth",
  "tls-cert": "TLS Certificate Auth",
  oci: "OCI Auth",
  alicloud: "Alibaba Cloud Auth",
  spiffe: "SPIFFE Auth"
};

export type OrgIdentity = {
  id: string;
  name: string;
  role: string;
  authMethods: AuthMethod[];
  hasDeleteProtection: boolean;
  lockedOut?: boolean;
  metadata: { key: string; value: string }[];
  createdAt: string;
  lastLogin?: string;
  managedByProject?: string;
  universalAuth?: UniversalAuthConfig;
};

export const orgIdentities: OrgIdentity[] = [
  {
    id: "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11",
    name: "ci-deployer",
    role: "member",
    authMethods: ["universal", "oidc"],
    hasDeleteProtection: true,
    metadata: [
      { key: "team", value: "platform" },
      { key: "runner", value: "github-actions" }
    ],
    createdAt: "Mar 4, 2026",
    lastLogin: "4 minutes ago"
  },
  {
    id: "9d27a4f1-0c3b-4e8a-b5f2-6a1d7c4e2b90",
    name: "k8s-payments-api",
    role: "no-access",
    authMethods: ["kubernetes", "universal"],
    hasDeleteProtection: true,
    metadata: [{ key: "team", value: "payments" }],
    createdAt: "Jan 22, 2026",
    lastLogin: "12 minutes ago"
  },
  {
    id: "1f6c3e9b-7a24-4d0e-8b51-c2e9a7d40f36",
    name: "terraform-runner",
    role: "admin",
    authMethods: ["universal"],
    hasDeleteProtection: false,
    lockedOut: true,
    metadata: [{ key: "team", value: "platform" }],
    createdAt: "Nov 30, 2025",
    lastLogin: "2 hours ago"
  },
  {
    id: "c83b5d07-2e91-4f6a-9c4d-8b0f1e7a5d22",
    name: "vercel-preview-sync",
    role: "member",
    authMethods: ["token"],
    hasDeleteProtection: false,
    metadata: [],
    createdAt: "May 12, 2026",
    lastLogin: "3 days ago"
  },
  {
    id: "e5a90f4c-6b17-4c3d-a2e8-3d9c0b6f1a74",
    name: "backup-signer",
    role: "member",
    authMethods: ["aws"],
    hasDeleteProtection: false,
    metadata: [],
    createdAt: "Jun 2, 2026",
    lastLogin: "1 day ago"
  },
  {
    id: "7b2d6e81-5f3a-4b9c-8e07-1a4c9d2f6b58",
    name: "cert-renewer",
    role: "member",
    authMethods: [],
    hasDeleteProtection: false,
    metadata: [],
    createdAt: "Oct 20, 2026"
  },
  {
    id: "2c8f1a6d-4e3b-4f9a-b7c2-5d0e8a1f9c37",
    name: "payments-webhook-worker",
    role: "no-access",
    authMethods: ["universal"],
    hasDeleteProtection: false,
    metadata: [],
    createdAt: "Sep 14, 2026",
    lastLogin: "25 minutes ago",
    managedByProject: "payments-api"
  }
];

export type ProjectRoleGrant = {
  id: string;
  role: string;
  isTemporary: boolean;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  temporaryAccessEndTime?: string;
};

export type ProjectMember = {
  id: string;
  userId: string;
  roles: ProjectRoleGrant[];
  createdAt: string;
};

export const DEMO_NOW = new Date("2026-10-30T16:00:00Z").getTime();
const hours = (h: number) => new Date(DEMO_NOW + h * 3_600_000).toISOString();

export const projectMembers: ProjectMember[] = [
  {
    id: "pm-sarah",
    userId: "u-sarah",
    roles: [{ id: "pr-1", role: "admin", isTemporary: false }],
    createdAt: "Jan 4, 2025"
  },
  {
    id: "pm-marcus",
    userId: "u-marcus",
    roles: [{ id: "pr-2", role: "admin", isTemporary: false }],
    createdAt: "Feb 11, 2025"
  },
  {
    id: "pm-priya",
    userId: "u-priya",
    roles: [{ id: "pr-3", role: "member", isTemporary: false }],
    createdAt: "Mar 2, 2025"
  },
  {
    id: "pm-diego",
    userId: "u-diego",
    roles: [
      { id: "pr-4", role: "viewer", isTemporary: false },
      {
        id: "pr-5",
        role: "member",
        isTemporary: true,
        temporaryRange: "7d",
        temporaryAccessStartTime: hours(-48),
        temporaryAccessEndTime: hours(120)
      },
      {
        id: "pr-6",
        role: "deploy-bot-reviewer",
        isTemporary: true,
        temporaryRange: "1d",
        temporaryAccessStartTime: hours(-72),
        temporaryAccessEndTime: hours(-48)
      }
    ],
    createdAt: "Apr 19, 2025"
  },
  {
    id: "pm-hana",
    userId: "u-hana",
    roles: [{ id: "pr-7", role: "deploy-bot-reviewer", isTemporary: false }],
    createdAt: "May 7, 2025"
  },
  {
    id: "pm-omar",
    userId: "u-omar",
    roles: [{ id: "pr-8", role: "viewer", isTemporary: false }],
    createdAt: "Oct 29, 2026"
  }
];

export type ProjectGroup = { groupId: string; roles: ProjectRoleGrant[]; createdAt: string };
export const projectGroups: ProjectGroup[] = [
  {
    groupId: "g-platform",
    roles: [{ id: "pg-1", role: "member", isTemporary: false }],
    createdAt: "Feb 1, 2025"
  },
  {
    groupId: "g-security",
    roles: [
      { id: "pg-2", role: "viewer", isTemporary: false },
      {
        id: "pg-3",
        role: "deploy-bot-reviewer",
        isTemporary: true,
        temporaryRange: "30d",
        temporaryAccessStartTime: hours(-24),
        temporaryAccessEndTime: hours(696)
      }
    ],
    createdAt: "May 7, 2025"
  }
];

export type ProjectIdentity = { identityId: string; roles: ProjectRoleGrant[]; createdAt: string };
export const projectIdentities: ProjectIdentity[] = [
  {
    identityId: "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11",
    roles: [{ id: "pi-1", role: "member", isTemporary: false }],
    createdAt: "Mar 4, 2026"
  },
  {
    identityId: "9d27a4f1-0c3b-4e8a-b5f2-6a1d7c4e2b90",
    roles: [{ id: "pi-2", role: "viewer", isTemporary: false }],
    createdAt: "Jan 22, 2026"
  },
  {
    identityId: "1f6c3e9b-7a24-4d0e-8b51-c2e9a7d40f36",
    roles: [{ id: "pi-3", role: "admin", isTemporary: false }],
    createdAt: "Nov 30, 2025"
  }
];

export type ServiceToken = {
  id: string;
  name: string;
  scopes: { environment: string; secretPath: string }[];
  permissions: ("read" | "write")[];
  expiresAt?: string;
  createdAt: string;
};
export const serviceTokens: ServiceToken[] = [
  {
    id: "st-1",
    name: "legacy-cron",
    scopes: [{ environment: "prod", secretPath: "/" }],
    permissions: ["read"],
    createdAt: "Feb 3, 2025"
  },
  {
    id: "st-2",
    name: "staging-smoke-tests",
    scopes: [
      { environment: "staging", secretPath: "/api" },
      { environment: "dev", secretPath: "/" }
    ],
    permissions: ["read", "write"],
    expiresAt: "Nov 30, 2026",
    createdAt: "Sep 9, 2026"
  }
];

export const environments = [
  { value: "dev", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "prod", label: "Production" }
];

export type UniversalAuthConfig = {
  accessTokenTTL: string;
  accessTokenMaxTTL: string;
  accessTokenNumUsesLimit: string;
  accessTokenPeriod: string;
  lockoutEnabled: boolean;
  lockoutThreshold: string;
  lockoutDurationValue: string;
  lockoutDurationUnit: string;
  lockoutCounterResetValue: string;
  lockoutCounterResetUnit: string;
  clientSecretTrustedIps: string[];
  accessTokenTrustedIps: string[];
};

export const DEFAULT_UNIVERSAL_AUTH: UniversalAuthConfig = {
  accessTokenTTL: "2592000",
  accessTokenMaxTTL: "2592000",
  accessTokenNumUsesLimit: "0",
  accessTokenPeriod: "0",
  lockoutEnabled: true,
  lockoutThreshold: "3",
  lockoutDurationValue: "5",
  lockoutDurationUnit: "m",
  lockoutCounterResetValue: "30",
  lockoutCounterResetUnit: "s",
  clientSecretTrustedIps: ["0.0.0.0/0", "::/0"],
  accessTokenTrustedIps: ["0.0.0.0/0", "::/0"]
};

export type ProjectType = "secret-manager" | "cert-manager" | "kms" | "ssh" | "pam";
export const projectTypeNames: Record<ProjectType, string> = {
  "secret-manager": "Secrets Management",
  "cert-manager": "Certificate Manager",
  kms: "KMS",
  ssh: "SSH",
  pam: "PAM"
};

export type OrgProject = { id: string; name: string; type: ProjectType; description?: string };
export const CURRENT_PROJECT_ID = "payments-api";
export const orgProjects: OrgProject[] = [
  {
    id: "payments-api",
    name: "payments-api",
    type: "secret-manager",
    description: "Secrets for the payments API"
  },
  { id: "web-dashboard", name: "web-dashboard", type: "secret-manager" },
  {
    id: "platform-core",
    name: "platform-core",
    type: "secret-manager",
    description: "Shared platform services"
  },
  { id: "kms-keys", name: "kms-keys", type: "kms" },
  { id: "ssh-bastion", name: "ssh-bastion", type: "ssh" },
  { id: "internal-pki", name: "internal-pki", type: "cert-manager" }
];

export type OtherProjectMembership = {
  id: string;
  projectId: string;
  subject: "user" | "identity" | "group";
  subjectId: string;
  roles: string[];
  createdAt: string;
};
export const otherProjectMemberships: OtherProjectMembership[] = [
  {
    id: "opm-1",
    projectId: "web-dashboard",
    subject: "user",
    subjectId: "u-priya",
    roles: ["member"],
    createdAt: "Apr 2, 2025"
  },
  {
    id: "opm-2",
    projectId: "platform-core",
    subject: "user",
    subjectId: "u-priya",
    roles: ["viewer", "member"],
    createdAt: "Jun 18, 2025"
  },
  {
    id: "opm-3",
    projectId: "internal-pki",
    subject: "user",
    subjectId: "u-priya",
    roles: ["admin"],
    createdAt: "Jul 1, 2025"
  },
  {
    id: "opm-4",
    projectId: "kms-keys",
    subject: "identity",
    subjectId: "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11",
    roles: ["admin"],
    createdAt: "Mar 9, 2026"
  },
  {
    id: "opm-5",
    projectId: "platform-core",
    subject: "group",
    subjectId: "g-platform",
    roles: ["admin"],
    createdAt: "Feb 3, 2025"
  }
];

export type AuthTemplateMethod = "ldap" | "kubernetes" | "oidc";
export type AuthTemplate = {
  id: string;
  name: string;
  method: AuthTemplateMethod;
  endpoint: string;
  usages: string[];
};
export const identityAuthTemplates: AuthTemplate[] = [
  {
    id: "t-ldap",
    name: "corp-ldap",
    method: "ldap",
    endpoint: "ldaps://ldap.acme.dev:636",
    usages: []
  },
  {
    id: "t-k8s",
    name: "prod-cluster",
    method: "kubernetes",
    endpoint: "https://k8s.prod.acme.dev:6443",
    usages: ["9d27a4f1-0c3b-4e8a-b5f2-6a1d7c4e2b90"]
  },
  {
    id: "t-oidc",
    name: "github-actions-oidc",
    method: "oidc",
    endpoint: "https://token.actions.githubusercontent.com",
    usages: ["4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11"]
  }
];

export type AccessData = {
  orgMembers: OrgMember[];
  orgGroups: OrgGroup[];
  orgIdentities: OrgIdentity[];
  orgRoles: Role[];
  projectMembers: ProjectMember[];
  projectGroups: ProjectGroup[];
  projectIdentities: ProjectIdentity[];
  serviceTokens: ServiceToken[];
  projectRoles: Role[];
  defaultOrgRole: string;
  identityAuthTemplates: AuthTemplate[];
  otherProjectMemberships: OtherProjectMembership[];
  rolePermissions: Record<string, RolePermissions>;
};

export const createData = (scenario: Scenario): AccessData => {
  if (scenario === "empty")
    return {
      orgMembers: orgMembers.filter((m) => m.user.id === SELF_USER_ID),
      orgGroups: [],
      orgIdentities: [],
      orgRoles: orgRoles.filter((r) => r.builtIn),
      projectMembers: projectMembers.filter((m) => m.userId === SELF_USER_ID),
      projectGroups: [],
      projectIdentities: [],
      serviceTokens: [],
      projectRoles: projectRoles.filter((r) => r.builtIn),
      defaultOrgRole: DEFAULT_ORG_ROLE,
      identityAuthTemplates: [],
      otherProjectMemberships: [],
      rolePermissions: seedRolePermissions()
    };
  return {
    orgMembers,
    orgGroups,
    orgIdentities,
    orgRoles,
    projectMembers,
    projectGroups,
    projectIdentities,
    serviceTokens,
    projectRoles,
    defaultOrgRole: DEFAULT_ORG_ROLE,
    identityAuthTemplates,
    otherProjectMemberships,
    rolePermissions: seedRolePermissions()
  };
};

export const roleName = (roles: readonly Role[], slug: string) =>
  roles.find((r) => r.slug === slug)?.name ?? slug;

export const displayName = (u: OrgUser) =>
  u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : undefined;

export const isExpired = (grant: ProjectRoleGrant) =>
  Boolean(
    grant.isTemporary &&
    grant.temporaryAccessEndTime &&
    new Date(grant.temporaryAccessEndTime).getTime() < DEMO_NOW
  );
