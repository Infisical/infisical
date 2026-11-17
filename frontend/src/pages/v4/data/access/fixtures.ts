import { IdentityAuthMethod, IdentityJwtConfigurationType } from "@app/hooks/api/identities/enums";
import type {
  ClientSecretData,
  Identity,
  IdentityAccessToken,
  IdentityAliCloudAuth,
  IdentityAwsAuth,
  IdentityAzureAuth,
  IdentityGcpAuth,
  IdentityJwtAuth,
  IdentityKubernetesAuth,
  IdentityLdapAuth,
  IdentityOciAuth,
  IdentityOidcAuth,
  IdentitySpiffeAuth,
  IdentityTlsCertAuth,
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
import {
  type DemoIdentityPrivilege,
  type DemoUserPrivilege,
  demoIdentityPrivileges,
  demoUserPrivileges
} from "./fixtures-privileges";

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
  orgId?: string;
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
  legacyPrivileges?: boolean;
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
  authConfigs: Partial<Record<IdentityAuthMethod, Record<string, unknown>>>;
  clientSecrets: Record<string, ClientSecretData[]>;
  authTemplates: IdentityAuthTemplate[];
  templateUsages: Record<string, string[]>;
  projects: DemoProject[];
  projectRoles: TProjectRole[];
  projectMemberships: DemoProjectMembership[];
  tokenAuthTokens: Record<string, IdentityAccessToken[]>;
  serviceTokens: ServiceToken[];
  userPrivileges: DemoUserPrivilege[];
  identityPrivileges: DemoIdentityPrivilege[];
  subOrg?: boolean;
  legacyPrivileges?: boolean;
  oidcGroupMemberships?: boolean;
};

export const DEMO_SELF_USER_ID = "u-sarah";
export const DEMO_PAM_PROJECT_ID = "pam";

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
  user("u-kenji", "Kenji", "Watanabe", "kenji.watanabe@contractors.acme-partners.example"),
  user("u-noor", "Noor", "Haddad", "noor@acme.dev")
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
  "audit-log-streams",
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
      { subject: "audit-log-streams", action: ["read"] },
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
  membership("m-julia", "u-julia", "member", "2026-10-30", { status: "invited" }),
  membership("m-noor", "u-noor", "member", "2026-11-16")
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
const EDGE_FLEET = "5e8b1c3d-27a4-4f90-b6d1-8c2e4a7f0b15";
const DIRECTORY_SYNC = "d1f4a7c2-9b36-4e05-8a7d-3c6e0f2b9a48";
const MESH_WORKLOAD = "2c7e9a14-6d3b-4f8a-91c5-b0e7d3a6f412";
const FEDERATION_BROKER = "8a3d6f20-1c9e-4b75-a4d8-6e2f0b9c3a57";
const SETTLEMENT_BROKER = "f04b7d19-3e6a-4c82-b1d5-9a7e2c6f8d30";
const LEDGER_EXPORTER = "6c1e8f42-b7d3-4a95-8e20-5f3a9d1c7b64";

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
  identity(EDGE_FLEET, "edge-fleet-agent", "2026-07-08", [
    IdentityAuthMethod.GCP_AUTH,
    IdentityAuthMethod.AZURE_AUTH,
    IdentityAuthMethod.OCI_AUTH,
    IdentityAuthMethod.ALICLOUD_AUTH
  ]),
  identity(DIRECTORY_SYNC, "directory-sync", "2026-04-17", [
    IdentityAuthMethod.LDAP_AUTH,
    IdentityAuthMethod.JWT_AUTH
  ]),
  identity(
    MESH_WORKLOAD,
    "mesh-workload",
    "2026-08-25",
    [IdentityAuthMethod.TLS_CERT_AUTH, IdentityAuthMethod.SPIFFE_AUTH],
    { projectId: "payments-api" }
  ),
  identity(
    SETTLEMENT_BROKER,
    "payments-settlement-broker-cross-account-reconciliation-pipeline",
    "2026-03-02",
    Object.values(IdentityAuthMethod),
    { projectId: "payments-api", activeLockoutAuthMethods: [IdentityAuthMethod.UNIVERSAL_AUTH] }
  ),
  identity(LEDGER_EXPORTER, "ledger-exporter", "2026-11-02", [], { projectId: "payments-api" }),
  identity(
    FEDERATION_BROKER,
    "federated-workload-broker-us-east-1-production-fleet",
    "2026-02-14",
    Object.values(IdentityAuthMethod),
    { activeLockoutAuthMethods: [IdentityAuthMethod.LDAP_AUTH] }
  ),
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
  identityOrgMembership("7b2d6e81-5f3a-4b9c-8e07-1a4c9d2f6b58", "member"),
  identityOrgMembership(EDGE_FLEET, "member", 45, IdentityAuthMethod.GCP_AUTH),
  identityOrgMembership(DIRECTORY_SYNC, "member", 300, IdentityAuthMethod.LDAP_AUTH),
  identityOrgMembership(FEDERATION_BROKER, "member", 2, IdentityAuthMethod.AWS_AUTH)
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

const pemBody = (seed: string, lines: number) =>
  Array.from({ length: lines }, (_, index) =>
    `${seed}${index.toString(36).toUpperCase()}`.repeat(8).slice(0, 64)
  ).join("\n");

const DEMO_CA_CERT = `-----BEGIN CERTIFICATE-----\n${pemBody("MIIDdzCCAl+gAwIBAgIUAcme", 6)}\n-----END CERTIFICATE-----`;

const LONG_CA_CERT = [1, 2, 3]
  .map(
    (part) =>
      `-----BEGIN CERTIFICATE-----\n${pemBody(`MIIF${part}zCCA1+gAwIBAgIQFederationBroker`, 28)}\n-----END CERTIFICATE-----`
  )
  .join("\n");

export const defaultGcpAuth = (identityId: string): IdentityGcpAuth => ({
  ...accessTokenDefaults(identityId),
  type: "gce",
  allowedServiceAccounts: "edge-agent@acme-edge.iam.gserviceaccount.com",
  allowedProjects: "acme-edge",
  allowedZones: "us-west2-a, us-central1-a"
});

export const defaultAzureAuth = (identityId: string): IdentityAzureAuth => ({
  ...accessTokenDefaults(identityId),
  tenantId: "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5",
  resource: "https://management.azure.com/",
  allowedServicePrincipalIds: "0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e"
});

export const defaultAliCloudAuth = (identityId: string): IdentityAliCloudAuth => ({
  ...accessTokenDefaults(identityId),
  type: "iam",
  allowedArns: "acs:ram::1284730012345678:role/edge-agent"
});

export const defaultOciAuth = (identityId: string): IdentityOciAuth => ({
  ...accessTokenDefaults(identityId),
  type: "iam",
  tenancyOcid: "ocid1.tenancy.oc1..aaaaaaaaedgefleet7q3x",
  allowedUsernames: "edge-agent"
});

export const defaultLdapAuth = (identityId: string): IdentityLdapAuth => ({
  ...accessTokenDefaults(identityId),
  url: "ldaps://ldap.acme.dev:636",
  bindDN: "cn=infisical,ou=services,dc=acme,dc=dev",
  searchBase: "ou=machines,dc=acme,dc=dev",
  searchFilter: "(uid={{username}})",
  ldapCaCertificate: "",
  allowedFields: [{ key: "memberOf", value: "cn=directory-sync,ou=groups,dc=acme,dc=dev" }],
  lockoutEnabled: true,
  lockoutThreshold: 3,
  lockoutDurationSeconds: 300,
  lockoutCounterResetSeconds: 30
});

export const defaultJwtAuth = (identityId: string): IdentityJwtAuth => ({
  ...accessTokenDefaults(identityId),
  configurationType: IdentityJwtConfigurationType.JWKS,
  jwksUrl: "https://auth.acme.dev/.well-known/jwks.json",
  jwksCaCert: "",
  publicKeys: [],
  boundIssuer: "https://auth.acme.dev",
  boundAudiences: "infisical",
  boundClaims: { team: "identity" },
  boundSubject: "directory-sync"
});

export const defaultTlsCertAuth = (identityId: string): IdentityTlsCertAuth => ({
  ...accessTokenDefaults(identityId),
  caCertificate: DEMO_CA_CERT,
  allowedCommonNames: "mesh-workload.svc.acme.dev",
  allowedSubjectAltNames: ["URI:spiffe://acme.dev/mesh/workload"],
  verifyClientCertificateChain: true,
  bindAccessTokenToCertificate: false
});

export const defaultSpiffeAuth = (identityId: string): IdentitySpiffeAuth => ({
  ...accessTokenDefaults(identityId),
  trustDomain: "acme.dev",
  allowedSpiffeIds: "spiffe://acme.dev/ns/mesh/sa/*",
  allowedAudiences: "infisical",
  trustBundleDistribution: {
    profile: "https_web_bundle",
    endpointUrl: "https://spire.acme.dev:8443",
    caCert: "",
    refreshHintSeconds: 3600,
    cachedBundleLastRefreshedAt: hours(-2)
  }
});

const stressIps = [
  ip("10.24.0.0", "ipv4", 16),
  ip("172.31.128.0", "ipv4", 20),
  ip("192.168.240.0", "ipv4", 24),
  ip("2600:1f18:4d2a:7b00::", "ipv6", 56),
  ip("2a05:d014:9c3:8e00::", "ipv6", 56),
  ip("203.0.113.42", "ipv4", 32)
];

const stressTokens = {
  accessTokenTTL: 86400,
  accessTokenMaxTTL: 7776000,
  accessTokenNumUsesLimit: 25000,
  accessTokenTrustedIps: stressIps
};

const stressClaims = Object.fromEntries([
  ["repository", "acme-corp/federated-workload-broker-infrastructure-monorepo"],
  ["repository_owner", "acme-corp"],
  ["ref", "refs/heads/release/2026-11-production-rollout"],
  ["environment", "production-us-east-1"],
  ["workflow", "deploy-federated-broker.yml"],
  ["job_workflow_ref", "acme-corp/shared-workflows/.github/workflows/deploy.yml@refs/tags/v4.12.0"],
  ["runner_environment", "self-hosted"],
  ["actor", "release-automation-bot"]
]);

const federationConfigs: Partial<Record<IdentityAuthMethod, unknown>> = {
  [IdentityAuthMethod.KUBERNETES_AUTH]: {
    ...defaultKubernetesAuth(FEDERATION_BROKER),
    ...stressTokens,
    templateId: null,
    kubernetesHost:
      "https://federation-control-plane-api.us-east-1.eks.amazonaws.com.internal.acme-corp.example:6443",
    allowedNamespaces:
      "federation-broker-production, federation-broker-canary, federation-broker-shadow, payments-*, ledger-reconciliation-*",
    allowedNames:
      "federated-workload-broker, federated-workload-broker-canary, ledger-reconciliation-worker, settlement-exporter",
    allowedAudience: "https://federation-control-plane-api.us-east-1.eks.amazonaws.com",
    caCert: LONG_CA_CERT,
    hasTokenReviewerJwt: true
  },
  [IdentityAuthMethod.AWS_AUTH]: {
    ...defaultAwsAuth(FEDERATION_BROKER),
    ...stressTokens,
    stsEndpoint: "https://sts.us-east-1.amazonaws.com/",
    allowedPrincipalArns: [
      "arn:aws:iam::441700233914:role/federated-workload-broker-production-execution-role",
      "arn:aws:iam::441700233914:role/federated-workload-broker-canary-execution-role",
      "arn:aws:sts::558213907761:assumed-role/OrganizationAccountAccessRole/release-automation",
      "arn:aws:iam::902118446530:role/service-role/ledger-reconciliation-batch-processing-role"
    ].join(", "),
    allowedAccountIds: "441700233914, 558213907761, 902118446530, 117349026588"
  },
  [IdentityAuthMethod.OIDC_AUTH]: {
    ...defaultOidcAuth(FEDERATION_BROKER),
    ...stressTokens,
    templateId: null,
    caCert: LONG_CA_CERT,
    boundAudiences:
      "https://github.com/acme-corp, sts.amazonaws.com, api://federated-workload-broker-production",
    boundClaims: stressClaims,
    claimMetadataMapping: { team: "repository_owner", pipeline: "workflow" },
    boundSubject:
      "repo:acme-corp/federated-workload-broker-infrastructure-monorepo:environment:production-us-east-1"
  },
  [IdentityAuthMethod.LDAP_AUTH]: {
    ...defaultLdapAuth(FEDERATION_BROKER),
    ...stressTokens,
    url: "ldaps://directory-primary.corp.us-east-1.acme-corp.example:636",
    bindDN:
      "cn=infisical-federation-broker,ou=service-accounts,ou=platform,dc=corp,dc=acme-corp,dc=example",
    searchBase: "ou=federated-machines,ou=platform,dc=corp,dc=acme-corp,dc=example",
    searchFilter:
      "(&(objectClass=device)(uid={{username}})(memberOf=cn=federation,ou=groups,dc=corp))",
    ldapCaCertificate: LONG_CA_CERT,
    allowedFields: [
      { key: "memberOf", value: "cn=federation-broker,ou=groups,dc=corp,dc=acme-corp,dc=example" },
      { key: "departmentNumber", value: "platform-infrastructure-4411" },
      { key: "employeeType", value: "service-account" }
    ]
  },
  [IdentityAuthMethod.TLS_CERT_AUTH]: {
    ...defaultTlsCertAuth(FEDERATION_BROKER),
    ...stressTokens,
    caCertificate: LONG_CA_CERT,
    allowedCommonNames:
      "federated-workload-broker.production.svc.cluster.local, federated-workload-broker.canary.svc.cluster.local",
    allowedSubjectAltNames: [
      "URI:spiffe://acme-corp.example/ns/federation-broker-production/sa/federated-workload-broker",
      "DNS:federated-workload-broker.us-east-1.internal.acme-corp.example",
      "DNS:*.federation-broker-production.svc.cluster.local"
    ],
    bindAccessTokenToCertificate: true
  },
  [IdentityAuthMethod.SPIFFE_AUTH]: {
    ...defaultSpiffeAuth(FEDERATION_BROKER),
    ...stressTokens,
    trustDomain: "production.us-east-1.federation.acme-corp.example",
    allowedSpiffeIds:
      "spiffe://production.us-east-1.federation.acme-corp.example/ns/federation-broker-production/sa/**, spiffe://production.us-east-1.federation.acme-corp.example/workloads/ledger-*",
    allowedAudiences: "infisical, https://federation-control-plane.acme-corp.example",
    trustBundleDistribution: { profile: "static", bundle: LONG_CA_CERT }
  },
  [IdentityAuthMethod.JWT_AUTH]: {
    ...defaultJwtAuth(FEDERATION_BROKER),
    ...stressTokens,
    configurationType: IdentityJwtConfigurationType.STATIC,
    jwksUrl: "",
    publicKeys: [LONG_CA_CERT, LONG_CA_CERT],
    boundClaims: stressClaims
  }
};

const authConfigs: AccessState["authConfigs"] = Object.fromEntries(
  Object.entries(federationConfigs).map(([method, config]) => [
    method,
    {
      [FEDERATION_BROKER]: config,
      [SETTLEMENT_BROKER]: { ...(config as object), identityId: SETTLEMENT_BROKER },
      ...(method === IdentityAuthMethod.LDAP_AUTH
        ? {
            [DIRECTORY_SYNC]: {
              ...defaultLdapAuth(DIRECTORY_SYNC),
              ldapCaCertificate: DEMO_CA_CERT
            }
          }
        : {})
    }
  ])
);

const stressedUniversalAuth = (identityId: string): IdentityUniversalAuth => ({
  ...defaultUniversalAuth(identityId),
  ...stressTokens,
  accessTokenPeriod: 0,
  clientSecretTrustedIps: stressIps,
  lockoutThreshold: 30,
  lockoutDurationSeconds: 86400,
  lockoutCounterResetSeconds: 3600
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
    environments: standardEnvironments("platform-core"),
    legacyPrivileges: true
  },
  { id: "kms-keys", name: "kms-keys", type: ProjectType.KMS, environments: [] },
  { id: "edge-signing", name: "edge-signing", type: ProjectType.KMS, environments: [] },
  {
    id: "internal-pki",
    name: "internal-pki",
    type: ProjectType.CertificateManager,
    environments: []
  },
  {
    id: "secret-scanning",
    name: "secret-scanning",
    type: ProjectType.SecretScanning,
    environments: []
  },
  {
    id: "platform-scanning",
    name: "platform-scanning",
    type: ProjectType.SecretScanning,
    environments: []
  },
  { id: DEMO_PAM_PROJECT_ID, name: "pam", type: ProjectType.PAM, environments: [] },
  { id: "agent-platform", name: "agent-platform", type: ProjectType.AgentVault, environments: [] },
  { id: "support-agents", name: "support-agents", type: ProjectType.AgentVault, environments: [] }
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
    kind: "user",
    id: "pcm-marcus",
    projectId: "platform-core",
    userId: "u-marcus",
    roles: [grant("pcr-1", "member")],
    createdAt: day("2025-06-20")
  },
  {
    kind: "user",
    id: "pcm-diego",
    projectId: "platform-core",
    userId: "u-diego",
    roles: [grant("pcr-2", "viewer")],
    createdAt: day("2025-07-11")
  },
  {
    kind: "identity",
    id: "pci-ci",
    projectId: "platform-core",
    identityId: CI_DEPLOYER,
    roles: [grant("pci-1", "member")],
    createdAt: day("2026-03-05")
  },
  {
    kind: "identity",
    id: "pci-tf",
    projectId: "platform-core",
    identityId: TERRAFORM,
    roles: [grant("pci-2", "viewer")],
    createdAt: day("2026-01-10")
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
    id: "pi-mesh",
    projectId: "payments-api",
    identityId: MESH_WORKLOAD,
    roles: [grant("pi-6", "member")],
    createdAt: day("2026-08-25"),
    lastLoginTime: minutesAgo(8)
  },
  {
    kind: "identity",
    id: "pi-directory",
    projectId: "payments-api",
    identityId: DIRECTORY_SYNC,
    roles: [grant("pi-7", "viewer")],
    createdAt: day("2026-04-17"),
    lastLoginTime: minutesAgo(300)
  },
  {
    kind: "identity",
    id: "pi-settlement",
    projectId: "payments-api",
    identityId: SETTLEMENT_BROKER,
    roles: [grant("pi-9", "member")],
    createdAt: day("2026-03-02"),
    lastLoginTime: minutesAgo(1)
  },
  {
    kind: "identity",
    id: "pi-ledger",
    projectId: "payments-api",
    identityId: LEDGER_EXPORTER,
    roles: [grant("pi-10", "viewer")],
    createdAt: day("2026-11-02")
  },
  {
    kind: "identity",
    id: "pi-federation",
    projectId: "payments-api",
    identityId: FEDERATION_BROKER,
    roles: [grant("pi-8", "member")],
    createdAt: day("2026-02-14"),
    lastLoginTime: minutesAgo(2)
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
  },
  {
    kind: "user",
    id: "ipm-sarah",
    projectId: "internal-pki",
    userId: "u-sarah",
    roles: [grant("ipmr-1", "admin")],
    createdAt: day("2025-03-10")
  },
  {
    kind: "user",
    id: "ipm-marcus",
    projectId: "internal-pki",
    userId: "u-marcus",
    roles: [grant("ipmr-2", "member")],
    createdAt: day("2025-04-11")
  },
  {
    kind: "group",
    id: "ipmg-security",
    projectId: "internal-pki",
    groupId: "g-security",
    roles: [grant("ipmg-1", "member")],
    createdAt: day("2025-08-21")
  },
  {
    kind: "identity",
    id: "ipmi-1",
    projectId: "internal-pki",
    identityId: CI_DEPLOYER,
    roles: [grant("ipmi-1", "member")],
    createdAt: day("2026-03-09"),
    lastLoginTime: minutesAgo(30)
  },
  {
    kind: "user",
    id: "ssm-sarah",
    projectId: "secret-scanning",
    userId: "u-sarah",
    roles: [grant("ssmr-1", "admin")],
    createdAt: day("2025-03-10")
  },
  {
    kind: "user",
    id: "psm-sarah",
    projectId: "platform-scanning",
    userId: "u-sarah",
    roles: [grant("psmr-1", "admin")],
    createdAt: day("2024-07-02")
  },
  {
    kind: "user",
    id: "ssm-priya",
    projectId: "secret-scanning",
    userId: "u-priya",
    roles: [grant("ssmr-2", "member")],
    createdAt: day("2025-04-11")
  },
  {
    kind: "user",
    id: "ssm-omar",
    projectId: "secret-scanning",
    userId: "u-omar",
    roles: [grant("ssmr-3", "viewer")],
    createdAt: day("2025-05-12")
  },
  {
    kind: "group",
    id: "ssmg-security",
    projectId: "secret-scanning",
    groupId: "g-security",
    roles: [grant("ssmg-1", "member")],
    createdAt: day("2025-08-21")
  },
  {
    kind: "identity",
    id: "ssmi-1",
    projectId: "secret-scanning",
    identityId: CI_DEPLOYER,
    roles: [grant("ssmi-1", "viewer")],
    createdAt: day("2026-03-09"),
    lastLoginTime: minutesAgo(30)
  },
  {
    kind: "user",
    id: "pmm-sarah",
    projectId: DEMO_PAM_PROJECT_ID,
    userId: "u-sarah",
    roles: [grant("pmmr-1", "admin")],
    createdAt: day("2025-03-10")
  },
  {
    kind: "user",
    id: "pmm-marcus",
    projectId: DEMO_PAM_PROJECT_ID,
    userId: "u-marcus",
    roles: [grant("pmmr-2", "member")],
    createdAt: day("2025-04-11")
  },
  {
    kind: "user",
    id: "pmm-priya",
    projectId: DEMO_PAM_PROJECT_ID,
    userId: "u-priya",
    roles: [grant("pmmr-3", "member")],
    createdAt: day("2025-05-12")
  },
  {
    kind: "user",
    id: "pmm-hana",
    projectId: DEMO_PAM_PROJECT_ID,
    userId: "u-hana",
    roles: [grant("pmmr-4", "member")],
    createdAt: day("2025-06-13")
  },
  {
    kind: "group",
    id: "pmmg-platform",
    projectId: DEMO_PAM_PROJECT_ID,
    groupId: "g-platform",
    roles: [grant("pmmg-1", "member")],
    createdAt: day("2025-08-21")
  },
  {
    kind: "identity",
    id: "pmmi-1",
    projectId: DEMO_PAM_PROJECT_ID,
    identityId: TERRAFORM,
    roles: [grant("pmmi-1", "member")],
    createdAt: day("2026-03-09"),
    lastLoginTime: minutesAgo(30)
  },
  {
    kind: "user",
    id: "avm-sarah",
    projectId: "agent-platform",
    userId: "u-sarah",
    roles: [grant("avmr-1", "admin")],
    createdAt: day("2025-03-10")
  },
  {
    kind: "user",
    id: "avm-diego",
    projectId: "agent-platform",
    userId: "u-diego",
    roles: [grant("avmr-2", "member")],
    createdAt: day("2025-04-11")
  },
  {
    kind: "user",
    id: "avm-omar",
    projectId: "agent-platform",
    userId: "u-omar",
    roles: [grant("avmr-3", "member")],
    createdAt: day("2025-05-12")
  },
  {
    kind: "group",
    id: "avmg-platform",
    projectId: "agent-platform",
    groupId: "g-platform",
    roles: [grant("avmg-1", "member")],
    createdAt: day("2025-08-21")
  },
  {
    kind: "identity",
    id: "avmi-1",
    projectId: "agent-platform",
    identityId: WEBHOOK_RELAY,
    roles: [grant("avmi-1", "member")],
    createdAt: day("2026-03-09"),
    lastLoginTime: minutesAgo(30)
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
  universalAuth: {
    ...universalAuth,
    [FEDERATION_BROKER]: stressedUniversalAuth(FEDERATION_BROKER),
    [SETTLEMENT_BROKER]: stressedUniversalAuth(SETTLEMENT_BROKER)
  },
  authConfigs,
  clientSecrets,
  authTemplates,
  templateUsages: { "t-k8s": [K8S_PAYMENTS], "t-oidc": [CI_DEPLOYER] },
  projects,
  projectRoles,
  projectMemberships,
  tokenAuthTokens,
  serviceTokens,
  userPrivileges: demoUserPrivileges(),
  identityPrivileges: demoIdentityPrivileges()
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
    authConfigs: {},
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
    serviceTokens: [],
    userPrivileges: [],
    identityPrivileges: []
  };
};

export const DEMO_ROOT_ORG_ID = "demo-root";

export const DEMO_ROOT_ORG_USERS = [
  {
    id: "u-ines",
    username: "ines@acme.dev",
    email: "ines@acme.dev",
    firstName: "Ines",
    lastName: "Moreau"
  },
  {
    id: "u-felix",
    username: "felix@acme.dev",
    email: "felix@acme.dev",
    firstName: "Felix",
    lastName: "Hart"
  },
  {
    id: "u-aurelia",
    username: "aurelia.konstantinopoulou-vandermeer@platform-engineering.acme-holdings.example",
    email: "aurelia.konstantinopoulou-vandermeer@platform-engineering.acme-holdings.example",
    firstName: "Aurelia",
    lastName: "Konstantinopoulou-Vandermeer"
  }
];

export const DEMO_ROOT_ORG_IDENTITIES = [
  { id: "8e1f0a3b-4c5d-4e6f-9a7b-1c2d3e4f5a60", name: "root-backup-runner" },
  {
    id: "0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d61",
    name: "shared-observability-exporter-for-every-regional-cluster"
  }
];

export const DEMO_ROOT_ORG_GROUPS = [
  { id: "g-root-sre", name: "sre-on-call", slug: "sre-on-call" },
  { id: "g-root-finance", name: "finance-approvers", slug: "finance-approvers" }
];

export const seedSubOrgAccessState = (): AccessState => {
  const seed = seedAccessState();
  return {
    ...seed,
    subOrg: true,
    groups: [
      ...seed.groups,
      {
        ...group("g-root-security-review", "security-review-board", "member", "2025-03-11"),
        orgId: DEMO_ROOT_ORG_ID
      }
    ],
    identities: seed.identities.map((entry) =>
      entry.id === TERRAFORM ? { ...entry, orgId: DEMO_ROOT_ORG_ID } : entry
    )
  };
};

const longWords = [
  "platform",
  "infrastructure",
  "observability",
  "settlement",
  "reconciliation",
  "compliance",
  "regional",
  "federation"
];

export const seedStressedAccessState = (): AccessState => {
  const seed = seedAccessState();
  const extraUsers = Array.from({ length: 48 }, (_, index) => {
    const word = longWords[index % longWords.length];
    return user(
      `u-stress-${index}`,
      index % 3 ? `Maximiliana-${word}` : "",
      index % 3 ? "Featherstonehaugh-Montgomery" : "",
      `${word}.engineering.team.member.${index}@very-long-subsidiary-name.acme-holdings.example`
    );
  });
  const extraGroups = Array.from({ length: 36 }, (_, index) =>
    group(
      `g-stress-${index}`,
      `${longWords[index % longWords.length]}-cross-functional-working-group-${index}`,
      index % 2 ? "member" : "security-auditor",
      "2026-01-15"
    )
  );
  const extraIdentities = Array.from({ length: 36 }, (_, index) =>
    identity(
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      `${longWords[index % longWords.length]}-batch-reconciliation-worker-${index}`,
      "2026-02-20",
      index % 2
        ? [
            IdentityAuthMethod.UNIVERSAL_AUTH,
            IdentityAuthMethod.KUBERNETES_AUTH,
            IdentityAuthMethod.AWS_AUTH
          ]
        : [IdentityAuthMethod.UNIVERSAL_AUTH]
    )
  );
  return {
    ...seed,
    users: [...seed.users, ...extraUsers],
    orgMemberships: [
      ...seed.orgMemberships,
      ...extraUsers.map((entry, index) =>
        membership(
          `m-stress-${index}`,
          entry.id,
          index % 4 ? "member" : "release-manager",
          "2026-03-01"
        )
      )
    ],
    groups: [...seed.groups, ...extraGroups],
    groupMembers: [
      ...seed.groupMembers,
      ...extraUsers.slice(0, 30).map((entry) => ({
        groupId: "g-platform",
        userId: entry.id,
        joinedGroupAt: day("2026-03-02")
      }))
    ],
    identities: [...seed.identities, ...extraIdentities],
    identityOrgMemberships: [
      ...seed.identityOrgMemberships,
      ...extraIdentities.map((entry) => ({
        id: `iom-${entry.id.slice(-8)}`,
        identityId: entry.id,
        role: "member",
        createdAt: entry.createdAt
      }))
    ]
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
