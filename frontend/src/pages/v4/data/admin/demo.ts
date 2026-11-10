import { AxiosError, AxiosHeaders } from "axios";

import {
  type AdminEmailDomain,
  type AdminIntegrationsConfig,
  LoginMethod,
  type OrganizationWithProjects,
  RootKeyEncryptionStrategy,
  SuperAdminErrorCode,
  type TEncryptionKeyRotation,
  type TEncryptionRootKey,
  type TGetEnvOverrides,
  type TServerConfig
} from "@app/hooks/api/admin/types";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type { Identity } from "@app/hooks/api/identities/types";
import { OrgMembershipStatus, SsoMfaTrust } from "@app/hooks/api/organization/types";
import type { Organization } from "@app/hooks/api/organization/types";
import { type SubscriptionPlan, SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import { AuthMethod, type User } from "@app/hooks/api/users/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { AdminAdapter } from "./contract";

const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const matches = (search: string | undefined, ...values: (string | null | undefined)[]) =>
  !search || values.some((value) => value?.toLowerCase().includes(search.toLowerCase()));

const pageOf = <T>(items: T[], offset = 0, limit = 10) => items.slice(offset, offset + limit);

const passwordPolicy = {
  requirements: [
    {
      code: "length",
      message: "At least 14 characters",
      validationMessage: "Password must be at least 14 characters",
      isPrimary: true,
      patterns: [".{14,}"],
      shouldMatch: true
    }
  ]
};

const config = createFixtureStore<TServerConfig>({
  initialized: true,
  allowSignUp: true,
  allowedSignUpDomain: "acme.dev",
  disableAuditLogStorage: false,
  defaultAuthOrgSlug: null,
  defaultAuthOrgId: null,
  enabledLoginMethods: [
    LoginMethod.EMAIL,
    LoginMethod.GOOGLE,
    LoginMethod.GITHUB,
    LoginMethod.SAML,
    LoginMethod.OIDC
  ],
  passwordPolicy,
  pkcs12PasswordPolicy: passwordPolicy,
  authConsentContent: "",
  pageFrameContent: "",
  allowedStorageHostnames: [],
  invalidatingCache: false,
  isPublicSecretSharingDisabled: false,
  isClickhouseAuditLogEnabled: false,
  latestAvailableVersion: null,
  instanceId: "7c1e9a52-3d4f-4b8e-a0c6-2f5e8d9b1a37",
  createdAt: "2024-03-14T09:00:00Z",
  trustLdapEmails: false,
  onboardingCompleted: true,
  isSecretScanningDisabled: false,
  kubernetesAutoFetchServiceAccountToken: false,
  isMigrationModeOn: false,
  fipsEnabled: false,
  paramsFolderSecretDetectionEnabled: false,
  isOfflineUsageReportsEnabled: true
});

const subscription: SubscriptionPlan = {
  id: "demo-plan",
  memberLimit: 0,
  identityLimit: 0,
  auditLogs: true,
  dynamicSecret: true,
  auditLogsRetentionDays: 90,
  auditLogStreamLimit: 5,
  auditLogStreams: true,
  customAlerts: true,
  pitRecovery: true,
  githubOrgSync: true,
  subOrganization: true,
  ipAllowlisting: true,
  rbac: true,
  secretVersioning: true,
  slug: SubscriptionPlanTypes.OnPremEnterprise,
  isOffline: true,
  secretApproval: true,
  secretRotation: true,
  tier: 3,
  workspaceLimit: 0,
  workspacesUsed: 9,
  environmentLimit: 0,
  samlSSO: true,
  secretAccessInsights: true,
  auditReports: true,
  hsm: true,
  oidcSSO: true,
  scim: true,
  ldap: true,
  groups: true,
  status: "active",
  trial_end: null,
  has_used_trial: true,
  instanceUserManagement: true,
  gateway: true,
  gatewayPool: true,
  pamEnterpriseAlerting: true,
  externalKms: true
} as SubscriptionPlan;

const organization = (id: string, name: string, slug: string, createdAt: string): Organization => ({
  id,
  name,
  slug,
  createAt: createdAt,
  updatedAt: createdAt,
  authEnforced: false,
  googleSsoAuthEnforced: false,
  bypassOrgAuthEnabled: false,
  orgAuthMethod: "",
  scimEnabled: false,
  defaultMembershipRole: "member",
  enforceMfa: false,
  ssoMfaTrust: SsoMfaTrust.None,
  shouldUseNewPrivilegeSystem: true,
  userRole: "admin",
  userJoinedAt: createdAt,
  secretsProductEnabled: true,
  pkiProductEnabled: true,
  kmsProductEnabled: true,
  scannerProductEnabled: true,
  shareSecretsProductEnabled: true,
  maxSharedSecretLifetime: 2592000,
  maxSharedSecretViewLimit: null,
  blockDuplicateSecretSyncDestinations: false,
  allowCrossProjectSecretSharing: false,
  requireGatewayPools: false,
  parentOrgId: null,
  rootOrgId: null,
  pamProjectId: null
});

const person = (
  id: string,
  firstName: string,
  lastName: string,
  email: string,
  createdAt: string,
  extra: Partial<User> = {}
): User => ({
  id,
  firstName,
  lastName,
  email,
  username: email,
  superAdmin: false,
  authMethods: [AuthMethod.EMAIL],
  isMfaEnabled: false,
  seenIps: [],
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt),
  ...extra
});

const users = createFixtureStore<User[]>([
  person("u-sarah", "Sarah", "Lin", "sarah@acme.dev", "2024-03-14T09:00:00Z", {
    superAdmin: true,
    isMfaEnabled: true,
    authMethods: [AuthMethod.EMAIL, AuthMethod.GOOGLE]
  }),
  person("u-marcus", "Marcus", "Reyes", "marcus@acme.dev", "2024-04-02T15:20:00Z", {
    superAdmin: true,
    authMethods: [AuthMethod.OKTA_SAML]
  }),
  person("u-priya", "Priya", "Natarajan", "priya@acme.dev", "2024-05-21T10:05:00Z", {
    isMfaEnabled: true
  }),
  person("u-jonas", "Jonas", "Berg", "jonas@acme.dev", "2024-07-09T08:45:00Z", {
    authMethods: [AuthMethod.GITHUB]
  }),
  person("u-amara", "Amara", "Okafor", "amara@globex.io", "2025-01-17T13:30:00Z"),
  person("u-diego", "Diego", "Alvarez", "diego@globex.io", "2025-03-03T11:10:00Z", {
    authMethods: [AuthMethod.OIDC]
  }),
  person("u-mei", "Mei", "Tanaka", "mei@initech.com", "2025-06-28T16:00:00Z"),
  person("u-oliver", "Oliver", "Grant", "oliver@initech.com", "2025-09-12T09:40:00Z", {
    authMethods: [AuthMethod.LDAP]
  })
]);

const member = (
  user: User,
  membershipId: string,
  role: string,
  status = OrgMembershipStatus.Accepted
) => ({
  user: {
    id: user.id,
    email: user.email ?? null,
    username: user.username,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null
  },
  membershipId,
  status,
  role,
  roleId: null
});

const project = (id: string, name: string, createdAt: string) => ({
  id,
  name,
  slug: id,
  createdAt
});

const initialUsers = users.get();
const userById = (id: string) => initialUsers.find((entry) => entry.id === id)!;

const organizations = createFixtureStore<OrganizationWithProjects[]>([
  {
    ...organization(V4_DEMO_ORG_ID, "Acme Corp", "acme-corp", "2024-03-14T09:00:00Z"),
    members: [
      member(userById("u-sarah"), "m-1", "admin"),
      member(userById("u-marcus"), "m-2", "admin"),
      member(userById("u-priya"), "m-3", "member"),
      member(userById("u-jonas"), "m-4", "member", OrgMembershipStatus.Invited)
    ],
    projects: [
      project("payments-api", "payments-api", "2024-03-20T10:00:00Z"),
      project("web-dashboard", "web-dashboard", "2024-04-11T10:00:00Z"),
      project("platform-core", "platform-core", "2024-06-02T10:00:00Z"),
      project("kms-keys", "kms-keys", "2024-08-19T10:00:00Z")
    ]
  },
  {
    ...organization("globex", "Globex", "globex", "2025-01-17T13:30:00Z"),
    members: [
      member(userById("u-amara"), "m-5", "admin"),
      member(userById("u-diego"), "m-6", "member")
    ],
    projects: [project("globex-billing", "billing", "2025-01-20T10:00:00Z")]
  },
  {
    ...organization("initech", "Initech", "initech", "2025-06-28T16:00:00Z"),
    members: [
      member(userById("u-mei"), "m-7", "admin"),
      member(userById("u-oliver"), "m-8", "member")
    ],
    projects: []
  },
  {
    ...organization("umbrella", "Umbrella Labs", "umbrella-labs", "2025-10-02T12:00:00Z"),
    members: [],
    projects: []
  }
]);

const identity = (
  id: string,
  name: string,
  orgId: string,
  authMethods: IdentityAuthMethod[],
  createdAt: string,
  isInstanceAdmin = false
): Identity => ({
  id,
  name,
  orgId,
  authMethods,
  activeLockoutAuthMethods: [],
  hasDeleteProtection: false,
  isInstanceAdmin,
  createdAt,
  updatedAt: createdAt
});

const identities = createFixtureStore<Identity[]>([
  identity(
    "i-terraform",
    "terraform-admin",
    V4_DEMO_ORG_ID,
    [IdentityAuthMethod.UNIVERSAL_AUTH],
    "2024-05-02T09:00:00Z",
    true
  ),
  identity(
    "i-k8s",
    "k8s-operator",
    V4_DEMO_ORG_ID,
    [IdentityAuthMethod.KUBERNETES_AUTH],
    "2024-07-15T09:00:00Z"
  ),
  identity(
    "i-gha",
    "github-actions",
    V4_DEMO_ORG_ID,
    [IdentityAuthMethod.OIDC_AUTH],
    "2025-02-11T09:00:00Z"
  ),
  identity(
    "i-globex-ci",
    "globex-ci",
    "globex",
    [IdentityAuthMethod.UNIVERSAL_AUTH, IdentityAuthMethod.AWS_AUTH],
    "2025-03-08T09:00:00Z"
  )
]);

const emailDomains = createFixtureStore<AdminEmailDomain[]>([
  {
    id: "d-acme",
    orgId: V4_DEMO_ORG_ID,
    orgName: "Acme Corp",
    domain: "acme.dev",
    verificationMethod: "dns-txt",
    status: "verified",
    verifiedAt: "2024-03-15T10:00:00Z",
    createdAt: "2024-03-15T09:00:00Z",
    updatedAt: "2024-03-15T10:00:00Z"
  },
  {
    id: "d-globex",
    orgId: "globex",
    orgName: "Globex",
    domain: "globex.io",
    verificationMethod: "dns-txt",
    status: "pending",
    verifiedAt: null,
    createdAt: "2025-11-01T09:00:00Z",
    updatedAt: "2025-11-01T09:00:00Z"
  }
]);

const strategies = createFixtureStore([
  { strategy: RootKeyEncryptionStrategy.Software, enabled: true },
  { strategy: RootKeyEncryptionStrategy.HSM, enabled: false }
]);

const rootKey = createFixtureStore<TEncryptionRootKey>({
  encryptionStrategy: RootKeyEncryptionStrategy.Software,
  active: { label: "root-2026-08", activatedAt: "2026-08-01T09:00:00Z" },
  staged: null,
  expiring: null
});

const rotations = createFixtureStore<TEncryptionKeyRotation[]>([
  {
    label: "root-2026-08",
    activatedAt: "2026-08-01T09:00:00Z",
    supersededAt: null,
    retiredAt: null
  },
  {
    label: "root-2026-02",
    activatedAt: "2026-02-01T09:00:00Z",
    supersededAt: "2026-08-01T09:00:00Z",
    retiredAt: "2026-08-31T09:00:00Z"
  },
  {
    label: "root-2025-08",
    activatedAt: "2025-08-01T09:00:00Z",
    supersededAt: "2026-02-01T09:00:00Z",
    retiredAt: "2026-03-03T09:00:00Z"
  }
]);

const integrations = createFixtureStore<AdminIntegrationsConfig>({
  slack: { clientId: "1234567890.0987654321", clientSecret: "demo-slack-secret" },
  microsoftTeams: { appId: "", clientSecret: "", botId: "" },
  gitHubAppConnection: { clientId: "", clientSecret: "", appSlug: "", appId: "", privateKey: "" }
});

const invalidating = createFixtureStore(false);

const envOverrides = createFixtureStore<TGetEnvOverrides>({
  smtp: {
    name: "SMTP",
    fields: [
      {
        key: "SMTP_HOST",
        value: "smtp.acme.dev",
        hasEnvEntry: true,
        description: "Mail server host"
      },
      { key: "SMTP_PORT", value: "587", hasEnvEntry: true, description: "Mail server port" },
      { key: "SMTP_FROM_ADDRESS", value: "", hasEnvEntry: false, description: "Sender address" }
    ]
  },
  github: {
    name: "GitHub SSO",
    fields: [
      { key: "CLIENT_ID_GITHUB_LOGIN", value: "", hasEnvEntry: false },
      { key: "CLIENT_SECRET_GITHUB_LOGIN", value: "", hasEnvEntry: false }
    ]
  }
});

const slicePage = <T>(items: T[], filters: { offset?: number; limit?: number }) => ({
  items: pageOf(items, filters.offset, filters.limit),
  totalCount: items.length
});

export const adminDemo: AdminAdapter = {
  useServerConfig: () => ok(config.use()),
  useUpdateServerConfig: fixtureMutation((dto) => {
    const {
      slackClientId,
      slackClientSecret,
      microsoftTeamsAppId,
      microsoftTeamsClientSecret,
      microsoftTeamsBotId,
      gitHubAppConnectionClientId,
      gitHubAppConnectionClientSecret,
      gitHubAppConnectionSlug,
      gitHubAppConnectionId,
      gitHubAppConnectionPrivateKey,
      envOverrides: overrides,
      ...rest
    } = dto;
    const adminAuthMethods: string[] = userById("u-sarah").authMethods ?? [];
    if (rest.enabledLoginMethods?.every((method) => !adminAuthMethods.includes(method))) {
      throw new AxiosError(
        "Request failed with status code 400",
        "ERR_BAD_REQUEST",
        undefined,
        {},
        {
          status: 400,
          statusText: "Bad Request",
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: {
            error: SuperAdminErrorCode.AuthMethodLockout,
            message: "You must configure at least one auth method to prevent account lockout"
          }
        }
      );
    }
    integrations.update((current) => ({
      slack: {
        clientId: slackClientId ?? current.slack.clientId,
        clientSecret: slackClientSecret ?? current.slack.clientSecret
      },
      microsoftTeams: {
        appId: microsoftTeamsAppId ?? current.microsoftTeams.appId,
        clientSecret: microsoftTeamsClientSecret ?? current.microsoftTeams.clientSecret,
        botId: microsoftTeamsBotId ?? current.microsoftTeams.botId
      },
      gitHubAppConnection: {
        clientId: gitHubAppConnectionClientId ?? current.gitHubAppConnection.clientId,
        clientSecret: gitHubAppConnectionClientSecret ?? current.gitHubAppConnection.clientSecret,
        appSlug: gitHubAppConnectionSlug ?? current.gitHubAppConnection.appSlug,
        appId: gitHubAppConnectionId ?? current.gitHubAppConnection.appId,
        privateKey: gitHubAppConnectionPrivateKey ?? current.gitHubAppConnection.privateKey
      }
    }));
    if (overrides) {
      envOverrides.update((current) =>
        Object.fromEntries(
          Object.entries(current).map(([group, entry]) => [
            group,
            {
              ...entry,
              fields: entry.fields.map((field) =>
                field.key in overrides ? { ...field, value: overrides[field.key] } : field
              )
            }
          ])
        )
      );
    }
    config.update((current) => ({ ...current, ...rest }));
    return config.get();
  }),
  useSubscription: () => ok(subscription),
  useUserOrganizations: () => ok(organizations.use()),
  useGenerateUsageReport: fixtureMutation(() => ({
    filename: "infisical-usage-report.csv",
    csvContent: "metric,value\nusers,8\norganizations,4\nidentities,4\n",
    signature: "demo-signature"
  })),

  useOrganizations: (filters) => {
    const all = organizations
      .use()
      .filter((entry) => matches(filters.searchTerm, entry.name, entry.slug));
    const { items, totalCount } = slicePage(all, filters);
    return ok({ organizations: items, totalCount });
  },
  useCreateOrganization: fixtureMutation(({ name }) => {
    const created = organization(
      crypto.randomUUID(),
      name,
      name.toLowerCase().replace(/\W+/g, "-"),
      new Date().toISOString()
    );
    organizations.update((current) => [{ ...created, members: [], projects: [] }, ...current]);
    return { organization: created };
  }),
  useDeleteOrganization: fixtureMutation((organizationId) => {
    organizations.update((current) => current.filter((entry) => entry.id !== organizationId));
    return {};
  }),
  useDeleteOrganizationMembership: fixtureMutation(({ organizationId, membershipId }) => {
    organizations.update((current) =>
      current.map((entry) =>
        entry.id === organizationId
          ? {
              ...entry,
              members: entry.members.filter((item) => item.membershipId !== membershipId)
            }
          : entry
      )
    );
    return {};
  }),
  useResendOrgInvite: fixtureMutation(() => undefined),
  useAccessOrganization: fixtureMutation(() => ({})),

  useUsers: (filters) => {
    const all = users
      .use()
      .filter(
        (entry) =>
          (!filters.adminsOnly || entry.superAdmin) &&
          matches(filters.searchTerm, entry.email, entry.username, entry.firstName, entry.lastName)
      );
    const { items, totalCount } = slicePage(all, filters);
    return ok({ users: items, totalCount });
  },
  useDeleteUser: fixtureMutation((userId) => {
    users.update((current) => current.filter((entry) => entry.id !== userId));
    return {};
  }),
  useBulkDeleteUsers: fixtureMutation((userIds) => {
    users.update((current) => current.filter((entry) => !userIds.includes(entry.id)));
    return {};
  }),
  useGrantServerAdminAccess: fixtureMutation((userId) => {
    users.update((current) =>
      current.map((entry) => (entry.id === userId ? { ...entry, superAdmin: true } : entry))
    );
    return {};
  }),
  useRemoveServerAdminAccess: fixtureMutation((userId) => {
    users.update((current) =>
      current.map((entry) => (entry.id === userId ? { ...entry, superAdmin: false } : entry))
    );
    return {};
  }),

  useIdentities: (filters) => {
    const all = identities.use().filter((entry) => matches(filters.searchTerm, entry.name));
    const { items, totalCount } = slicePage(all, filters);
    return ok({ identities: items, totalCount });
  },
  useRemoveIdentityServerAdminAccess: fixtureMutation((identityId) => {
    identities.update((current) =>
      current.map((entry) =>
        entry.id === identityId ? { ...entry, isInstanceAdmin: false } : entry
      )
    );
    return {};
  }),

  useEmailDomains: (filters) => {
    const all = emailDomains
      .use()
      .filter((entry) => matches(filters.searchTerm, entry.domain, entry.orgName));
    const { items, totalCount } = slicePage(all, filters);
    return ok({ emailDomains: items, totalCount });
  },
  useCreateEmailDomain: fixtureMutation(({ orgId, domain }) => {
    const at = new Date().toISOString();
    const created: AdminEmailDomain = {
      id: crypto.randomUUID(),
      orgId,
      orgName: organizations.get().find((entry) => entry.id === orgId)?.name ?? null,
      domain,
      verificationMethod: "dns-txt",
      status: "pending",
      verifiedAt: null,
      createdAt: at,
      updatedAt: at
    };
    emailDomains.update((current) => [created, ...current]);
    return { emailDomain: created };
  }),
  useDeleteEmailDomain: fixtureMutation((emailDomainId) => {
    const removed = emailDomains.get().find((entry) => entry.id === emailDomainId)!;
    emailDomains.update((current) => current.filter((entry) => entry.id !== emailDomainId));
    return { emailDomain: removed };
  }),

  useEncryptionStrategies: () => ok({ strategies: strategies.use() }),
  useUpdateEncryptionStrategy: fixtureMutation((strategy) => {
    strategies.update((current) =>
      current.map((entry) => ({ ...entry, enabled: entry.strategy === strategy }))
    );
    rootKey.update((current) => ({ ...current, encryptionStrategy: strategy }));
    return {};
  }),
  useEncryptionRootKey: () => ok(rootKey.use()),
  useEncryptionKeyRotations: ({ offset, limit }) => {
    const all = rotations.use();
    return ok({ rotations: pageOf(all, offset, limit), totalCount: all.length });
  },
  useCreateEncryptionKeyRotation: fixtureMutation(() => {
    const label = `root-${new Date().toISOString().slice(0, 7)}-staged`;
    rootKey.update((current) => ({
      ...current,
      staged: { label, createdAt: new Date().toISOString() }
    }));
    return { label, key: "ZGVtby1zdGFnZWQtcm9vdC1rZXktbWF0ZXJpYWwtZm9yLXRoZS1kZW1v" };
  }),
  useDeleteStagedEncryptionKey: fixtureMutation(() => {
    rootKey.update((current) => ({ ...current, staged: null }));
    return {};
  }),
  useDeleteExpiringEncryptionKey: fixtureMutation(() => {
    rootKey.update((current) => ({ ...current, expiring: null }));
    return {};
  }),

  useIntegrationsConfig: () => ok(integrations.use()),

  useInvalidatingCacheStatus: () => ok(invalidating.use()),
  useInvalidateCache: fixtureMutation(() => {
    invalidating.update(() => true);
    window.setTimeout(() => invalidating.update(() => false), 8000);
  }),

  useEnvOverrides: () => ok(envOverrides.use()),

  useCacheInvalidationStatus: () => ({
    ...ok(invalidating.use()),
    isFetching: false,
    refetch: async () => ({ data: invalidating.get() })
  })
};
