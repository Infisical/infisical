import { createMongoAbility, type RawRuleOf, type MongoAbility } from "@casl/ability";
import { packRules } from "@casl/ability/extra";
import { useRouterState } from "@tanstack/react-router";

import type { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";
import type { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";
import { MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK } from "@app/helpers/identityAuthSchemas";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { GroupMemberType, type TGroupMembership } from "@app/hooks/api/groups/types";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import {
  type IdentityMembershipOrg,
  type IdentityMembershipSearchResult,
  type IdentityProjectMembershipV1,
  SearchIdentitiesScope
} from "@app/hooks/api/identities/types";
import { MachineIdentityAuthMethod } from "@app/hooks/api/identityAuthTemplates/types";
import {
  OrgIdentityOrderBy,
  type Organization,
  SsoMfaTrust
} from "@app/hooks/api/organization/types";
import {
  type Project,
  ProjectType,
  ProjectVersion,
  type TPermissionAuditSource
} from "@app/hooks/api/projects/types";
import type { TOrgRole, TProjectPermission } from "@app/hooks/api/roles/types";
import type { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";
import { TemporaryPermissionMode, type TIdentity } from "@app/hooks/api/shared/types";
import type { TOrgUserAccess, TWorkspaceUser, OrgUser } from "@app/hooks/api/users/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore } from "../fixture-store";
import type { AccessAdapter } from "./contract";
import {
  type AccessState,
  DEMO_PAM_PROJECT_ID,
  DEMO_PROJECT_TAGS,
  DEMO_ROOT_ORG_GROUPS,
  DEMO_ROOT_ORG_ID,
  DEMO_ROOT_ORG_IDENTITIES,
  DEMO_ROOT_ORG_USERS,
  DEMO_SELF_USER_ID,
  DEMO_VAULT_CONNECTIONS,
  DEMO_VAULT_NAMESPACES,
  defaultAliCloudAuth,
  defaultAwsAuth,
  defaultAzureAuth,
  defaultGcpAuth,
  defaultJwtAuth,
  defaultKubernetesAuth,
  defaultLdapAuth,
  defaultOciAuth,
  defaultOidcAuth,
  defaultSpiffeAuth,
  defaultTlsCertAuth,
  defaultTokenAuth,
  defaultUniversalAuth,
  type DemoProjectMembership,
  type DemoRoleGrant,
  type DemoUser,
  seedAccessState,
  seedEmptyAccessState,
  seedStressedAccessState,
  seedSubOrgAccessState,
  TEMPORARY_MODE
} from "./fixtures";

const SCENARIOS = [
  "default",
  "read-only",
  "restricted",
  "denied",
  "empty",
  "loading",
  "stressed",
  "sub-org",
  "legacy-privileges",
  "oidc-groups"
] as const;
export type AccessScenario = (typeof SCENARIOS)[number];

export const useAccessScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { scenario?: unknown }).scenario;
      return SCENARIOS.find((scenario) => scenario === value) ?? "default";
    }
  });

const stores = {
  default: createFixtureStore(seedAccessState()),
  empty: createFixtureStore(seedEmptyAccessState()),
  stressed: createFixtureStore(seedStressedAccessState()),
  "sub-org": createFixtureStore(seedSubOrgAccessState()),
  "legacy-privileges": createFixtureStore<AccessState>({
    ...seedAccessState(),
    legacyPrivileges: true
  }),
  "oidc-groups": createFixtureStore<AccessState>({
    ...seedAccessState(),
    oidcGroupMemberships: true
  })
};
const storeFor = (scenario: AccessScenario) =>
  scenario in stores ? stores[scenario as keyof typeof stores] : stores.default;

export const useDemoAccessState = () => storeFor(useAccessScenario()).use();

const cache = new WeakMap<AccessState, Map<string, unknown>>();
const cached = <T>(state: AccessState, key: string, compute: () => T): T => {
  let entries = cache.get(state);
  if (!entries) {
    entries = new Map();
    cache.set(state, entries);
  }
  if (!entries.has(key)) entries.set(key, compute());
  return entries.get(key) as T;
};

class NotFoundError extends Error {
  status = 404;
}

const demoQuery =
  <TArgs extends unknown[], TData>(
    name: string,
    compute: (state: AccessState, ...args: TArgs) => TData | undefined
  ) =>
  (...args: TArgs) => {
    const scenario = useAccessScenario();
    const state = storeFor(scenario).use();
    const data = cached(state, `${name}:${JSON.stringify(args)}`, () => compute(state, ...args));
    if (scenario === "loading") return { data: undefined, isPending: true, error: null };
    return {
      data,
      isPending: false,
      error: data === undefined ? new NotFoundError(`${name} not found`) : null
    };
  };

const demoMutation =
  <TVariables, TData>(
    run: (variables: TVariables, state: AccessState) => { state: AccessState; result: TData }
  ) =>
  () => {
    const store = storeFor(useAccessScenario());
    return {
      isPending: false,
      mutateAsync: async (variables: TVariables) => {
        const { state, result } = run(variables, store.get());
        store.update(() => state);
        return result;
      }
    };
  };

const done = <TData>(state: AccessState, result: TData) => ({ state, result });

const stamp = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

const BUILT_IN_ORG_ROLES = ["admin", "member", "no-access"];
const BUILT_IN_PROJECT_ROLES = ["admin", "member", "viewer", "no-access"];

const orgRoleRef = (state: AccessState, slug: string) => {
  const role = state.orgRoles.find((entry) => entry.slug === slug);
  return {
    role: BUILT_IN_ORG_ROLES.includes(slug) ? slug : "custom",
    roleId: role?.id ?? ""
  };
};
const orgRoleOf = (state: AccessState, role: string, roleId?: string) =>
  state.orgRoles.find((entry) => (role === "custom" ? entry.id === roleId : entry.slug === role));

const userOf = (state: AccessState, userId: string) =>
  state.users.find((entry) => entry.id === userId)!;

const projectOf = (state: AccessState, projectId: string) =>
  state.projects.find((entry) => entry.id === projectId);

type WorkspaceRole = TWorkspaceUser["roles"][number];
const workspaceRole = (state: AccessState, grant: DemoRoleGrant): WorkspaceRole => {
  const custom = BUILT_IN_PROJECT_ROLES.includes(grant.role)
    ? undefined
    : state.projectRoles.find((role) => role.slug === grant.role);
  const base = {
    id: grant.id,
    role: (custom ? "custom" : grant.role) as WorkspaceRole["role"],
    customRoleId: custom?.id ?? "",
    customRoleName: custom?.name ?? "",
    customRoleSlug: custom?.slug ?? ""
  };
  return grant.isTemporary
    ? {
        ...base,
        isTemporary: true,
        temporaryRange: grant.temporaryRange ?? "1d",
        temporaryMode: TEMPORARY_MODE,
        temporaryAccessStartTime: grant.temporaryAccessStartTime ?? stamp(),
        temporaryAccessEndTime: grant.temporaryAccessEndTime ?? stamp()
      }
    : {
        ...base,
        isTemporary: false,
        temporaryRange: null,
        temporaryMode: null,
        temporaryAccessEndTime: null,
        temporaryAccessStartTime: null
      };
};

type RoleInput =
  | { role: string; isTemporary?: false }
  | { role: string; isTemporary: true; temporaryRange: string; temporaryAccessStartTime: string };

const RANGE_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31536000
};
const rangeSeconds = (range: string) => {
  const match = /^(\d+)([smhdwy])$/.exec(range);
  return match ? Number(match[1]) * RANGE_UNITS[match[2]] : 0;
};

const toGrants = (roles: readonly RoleInput[]): DemoRoleGrant[] =>
  roles.map((input) =>
    input.isTemporary
      ? {
          id: newId(),
          role: input.role,
          isTemporary: true,
          temporaryRange: input.temporaryRange,
          temporaryAccessStartTime: input.temporaryAccessStartTime,
          temporaryAccessEndTime: new Date(
            new Date(input.temporaryAccessStartTime).getTime() +
              rangeSeconds(input.temporaryRange) * 1000
          ).toISOString()
        }
      : { id: newId(), role: input.role, isTemporary: false }
  );

const workspaceUser = (
  state: AccessState,
  membership: Extract<DemoProjectMembership, { kind: "user" }>,
  isGroupMember = false
): TWorkspaceUser => {
  const person = userOf(state, membership.userId);
  const org = state.orgMemberships.find((entry) => entry.userId === person.id);
  const project = projectOf(state, membership.projectId)!;
  return {
    id: membership.id,
    user: {
      isOrgMembershipActive: org?.isActive ?? true,
      isOrgMembershipPending: org?.status === "invited",
      email: person.email,
      username: person.username,
      firstName: person.firstName,
      lastName: person.lastName,
      id: person.id,
      publicKey: ""
    },
    createdAt: membership.createdAt,
    projectId: membership.projectId,
    isGroupMember,
    project: { id: project.id, name: project.name, type: project.type },
    inviteEmail: person.email,
    organization: V4_DEMO_ORG_ID,
    roles: membership.roles.map((grant) => workspaceRole(state, grant)),
    status: org?.status ?? "accepted",
    deniedPermissions: []
  };
};

const identityOf = (state: AccessState, identityId: string) =>
  state.identities.find((entry) => entry.id === identityId);

const toTIdentity = (identity: AccessState["identities"][number]): TIdentity => ({
  ...identity,
  projectId: identity.projectId ?? null
});

const identityRole = (
  state: AccessState,
  grant: DemoRoleGrant
): IdentityProjectMembershipV1["roles"][number] => {
  const role = workspaceRole(state, grant);
  return role.isTemporary ? { ...role, temporaryMode: TemporaryPermissionMode.Relative } : role;
};

const identityProjectMembership = (
  state: AccessState,
  membership: Extract<DemoProjectMembership, { kind: "identity" }>
): IdentityProjectMembershipV1 => {
  const project = projectOf(state, membership.projectId)!;
  return {
    id: membership.id,
    identity: identityOf(state, membership.identityId)!,
    project: { id: project.id, name: project.name, type: project.type },
    roles: membership.roles.map((grant) => identityRole(state, grant)),
    createdAt: membership.createdAt,
    updatedAt: membership.createdAt,
    lastLoginTime: membership.lastLoginTime,
    lastLoginAuthMethod: membership.lastLoginTime ? IdentityAuthMethod.UNIVERSAL_AUTH : undefined
  };
};

const groupMembership = (
  state: AccessState,
  membership: Extract<DemoProjectMembership, { kind: "group" }>
): TGroupMembership => {
  const group = state.groups.find((entry) => entry.id === membership.groupId)!;
  return {
    id: membership.id,
    group: { orgId: V4_DEMO_ORG_ID, ...group, updatedAt: group.createdAt },
    roles: membership.roles.map((grant) => workspaceRole(state, grant)),
    createdAt: membership.createdAt,
    updatedAt: membership.createdAt
  };
};

const membershipsOf = <K extends DemoProjectMembership["kind"]>(
  state: AccessState,
  kind: K,
  projectId?: string
) =>
  state.projectMemberships.filter(
    (entry): entry is Extract<DemoProjectMembership, { kind: K }> =>
      entry.kind === kind && (!projectId || entry.projectId === projectId)
  );

const orgUserAccess = (state: AccessState): TOrgUserAccess[] =>
  state.users
    .map((person) => {
      const membership = state.orgMemberships.find((entry) => entry.userId === person.id);
      const groups = state.groupMembers
        .filter((entry) => entry.userId === person.id)
        .map((entry) => state.groups.find((group) => group.id === entry.groupId)!)
        .map((group) => ({
          id: group.id,
          name: group.name,
          slug: group.slug,
          roles: [{ role: group.role, roleId: group.roleId }]
        }));
      return {
        user: {
          id: person.id,
          username: person.username,
          email: person.email,
          firstName: person.firstName,
          lastName: person.lastName,
          publicKey: null,
          superAdmin: person.superAdmin
        },
        membership: membership
          ? {
              id: membership.id,
              role: membership.role as TOrgUserAccess["user"] extends never
                ? never
                : OrgUser["role"],
              roleId: membership.roleId,
              status: membership.status,
              isActive: membership.isActive,
              lastLoginAuthMethod: membership.lastLoginAuthMethod,
              lastLoginTime: membership.lastLoginTime,
              inviteEmail: person.email
            }
          : null,
        groups
      };
    })
    .filter((entry) => entry.membership || entry.groups.length);

const orgMembershipDetail = (state: AccessState, membershipId: string): OrgUser | undefined => {
  const membership = state.orgMemberships.find((entry) => entry.id === membershipId);
  if (!membership) return undefined;
  const person = userOf(state, membership.userId);
  return {
    id: membership.id,
    metadata: membership.metadata,
    user: {
      username: person.username,
      email: person.email,
      isEmailVerified: person.isEmailVerified,
      firstName: person.firstName,
      lastName: person.lastName,
      id: person.id,
      publicKey: "",
      superAdmin: person.superAdmin
    },
    inviteEmail: person.email,
    organization: V4_DEMO_ORG_ID,
    role: membership.role as OrgUser["role"],
    customRoleSlug:
      membership.role === "custom"
        ? orgRoleOf(state, membership.role, membership.roleId)?.slug
        : undefined,
    status: membership.status,
    deniedPermissions: [],
    roleId: membership.roleId,
    isActive: membership.isActive,
    lastLoginAuthMethod: membership.lastLoginAuthMethod,
    lastLoginTime: membership.lastLoginTime
  };
};

const identityOrgDetail = (
  state: AccessState,
  identityId: string
): IdentityMembershipOrg | undefined => {
  const membership = state.identityOrgMemberships.find((entry) => entry.identityId === identityId);
  const identity = identityOf(state, identityId);
  if (!identity) return undefined;
  const customRole =
    membership?.role === "custom" ? orgRoleOf(state, "custom", membership.roleId) : undefined;
  return {
    id: membership?.id ?? `iom-${identity.id.slice(0, 8)}`,
    identity,
    organization: V4_DEMO_ORG_ID,
    lastLoginAuthMethod: membership?.lastLoginAuthMethod,
    lastLoginTime: membership?.lastLoginTime,
    metadata: identity.metadata ?? [],
    role: (membership?.role ?? "no-access") as IdentityMembershipOrg["role"],
    customRole,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt
  };
};

const searchRole = (state: AccessState, role: string, roleId?: string) => {
  const found = orgRoleOf(state, role, roleId);
  return {
    id: roleId ?? found?.id ?? role,
    role,
    customRoleId: role === "custom" ? (found?.id ?? null) : null,
    customRoleName: role === "custom" ? (found?.name ?? null) : null,
    customRoleSlug: role === "custom" ? (found?.slug ?? null) : null,
    customRoleDescription: role === "custom" ? (found?.description ?? null) : null,
    isTemporary: false
  };
};

const identitySearchRows = (state: AccessState): IdentityMembershipSearchResult[] =>
  state.identities.map((identity) => {
    const membership = state.identityOrgMemberships.find(
      (entry) => entry.identityId === identity.id
    );
    const project = identity.projectId ? projectOf(state, identity.projectId) : undefined;
    const projectMembership = membershipsOf(state, "identity", identity.projectId ?? "").find(
      (entry) => entry.identityId === identity.id
    );
    return {
      id: membership?.id ?? projectMembership?.id ?? identity.id,
      identityId: identity.id,
      scope: project ? SearchIdentitiesScope.ProjectScope : SearchIdentitiesScope.OrganizationScope,
      orgId: V4_DEMO_ORG_ID,
      projectId: project?.id ?? null,
      project: project
        ? { id: project.id, name: project.name, slug: project.id, type: project.type }
        : null,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
      lastLoginAuthMethod: membership?.lastLoginAuthMethod ?? null,
      lastLoginTime: membership?.lastLoginTime ?? projectMembership?.lastLoginTime ?? null,
      roles: membership
        ? [searchRole(state, membership.role, membership.roleId)]
        : (projectMembership?.roles ?? []).map((grant) => ({
            id: grant.id,
            role: grant.role,
            isTemporary: grant.isTemporary
          })),
      identity: {
        id: identity.id,
        name: identity.name,
        hasDeleteProtection: identity.hasDeleteProtection,
        orgId: identity.orgId,
        authMethods: identity.authMethods,
        activeLockoutAuthMethods: identity.activeLockoutAuthMethods
      }
    };
  });

const roleLabel = (row: IdentityMembershipSearchResult) =>
  row.roles[0]?.customRoleName ?? row.roles[0]?.role ?? "";

const contains = (value: string, needle?: string) =>
  !needle || value.toLowerCase().includes(needle.toLowerCase());

const identitySearchMatches = (
  row: IdentityMembershipSearchResult,
  search: Parameters<AccessAdapter["useCountOrgIdentities"]>[0]["search"]
) => {
  const name = search.name?.$contains ?? search.$or?.find((entry) => entry.name)?.name?.$contains;
  const role = search.role?.$contains ?? search.$or?.find((entry) => entry.role)?.role?.$contains;
  return search.$or
    ? contains(row.identity.name, name) || contains(roleLabel(row), role)
    : contains(row.identity.name, name) && contains(roleLabel(row), role);
};

const toTrustedIps = (list: { ipAddress: string }[]) =>
  list.map((entry) => ({
    id: newId(),
    ipAddress: entry.ipAddress.split("/")[0],
    type: entry.ipAddress.includes(":") ? ("ipv6" as const) : ("ipv4" as const),
    prefix: Number(entry.ipAddress.split("/")[1] ?? 0)
  }));

const storedAuth = <T>(
  state: AccessState,
  method: IdentityAuthMethod,
  identityId: string,
  fallback: (identityId: string) => T
) => (state.authConfigs[method]?.[identityId] as T | undefined) ?? fallback(identityId);

const withoutMethod = (
  state: AccessState,
  method: IdentityAuthMethod,
  identityId: string
): AccessState => {
  const { [identityId]: _removed, ...rest } = state.authConfigs[method] ?? {};
  return {
    ...state,
    authConfigs: { ...state.authConfigs, [method]: rest },
    identities: state.identities.map((entry) =>
      entry.id === identityId
        ? {
            ...entry,
            authMethods: entry.authMethods.filter((item) => item !== method),
            activeLockoutAuthMethods: entry.activeLockoutAuthMethods.filter(
              (item) => item !== method
            )
          }
        : entry
    )
  };
};

const identityAuthConfig = <T>(
  name: string,
  method: IdentityAuthMethod,
  build: (identityId: string) => T
) =>
  demoQuery(name, (state, identityId: string) =>
    identityOf(state, identityId)?.authMethods.includes(method)
      ? storedAuth(state, method, identityId, build)
      : undefined
  );

const WRITE_ONLY_FIELDS = new Set(["organizationId", "projectId", "bindPass", "tokenReviewerJwt"]);

const saveIdentityAuth = <TDto extends { identityId: string }, T>(
  method: IdentityAuthMethod,
  fallback: (identityId: string) => T,
  mode: "add" | "update"
) =>
  demoMutation((dto: TDto, state: AccessState) => {
    const fields = Object.fromEntries(
      Object.entries(dto).filter(
        ([key, value]) => value !== undefined && !WRITE_ONLY_FIELDS.has(key)
      )
    );
    const trustedIps = (dto as { accessTokenTrustedIps?: { ipAddress: string }[] })
      .accessTokenTrustedIps;
    const next = {
      ...storedAuth(state, method, dto.identityId, fallback),
      ...(mode === "add" ? { templateId: undefined } : {}),
      ...fields,
      ...(trustedIps ? { accessTokenTrustedIps: toTrustedIps(trustedIps) } : {})
    } as T;
    return done(
      {
        ...state,
        authConfigs: {
          ...state.authConfigs,
          [method]: { ...state.authConfigs[method], [dto.identityId]: next }
        },
        identities:
          mode === "add"
            ? state.identities.map((entry) =>
                entry.id === dto.identityId && !entry.authMethods.includes(method)
                  ? { ...entry, authMethods: [...entry.authMethods, method] }
                  : entry
              )
            : state.identities
      },
      next
    );
  });

const removeIdentityAuthMethod = <T>(
  method: IdentityAuthMethod,
  fallback: (identityId: string) => T
) =>
  demoMutation(({ identityId }: { identityId: string }, state: AccessState) =>
    done(withoutMethod(state, method, identityId), storedAuth(state, method, identityId, fallback))
  );

const authMethodAdapter = <
  TAdd extends { identityId: string },
  TUpdate extends { identityId: string },
  T
>(
  method: IdentityAuthMethod,
  fallback: (identityId: string) => T
) => ({
  query: identityAuthConfig(method, method, fallback),
  add: saveIdentityAuth<TAdd, T>(method, fallback, "add"),
  update: saveIdentityAuth<TUpdate, T>(method, fallback, "update"),
  remove: removeIdentityAuthMethod(method, fallback)
});

const authMethods = {
  Token: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityTokenAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityTokenAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultTokenAuth>
  >(IdentityAuthMethod.TOKEN_AUTH, defaultTokenAuth),
  Kubernetes: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityKubernetesAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityKubernetesAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultKubernetesAuth>
  >(IdentityAuthMethod.KUBERNETES_AUTH, defaultKubernetesAuth),
  Aws: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityAwsAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityAwsAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultAwsAuth>
  >(IdentityAuthMethod.AWS_AUTH, defaultAwsAuth),
  Oidc: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityOidcAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityOidcAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultOidcAuth>
  >(IdentityAuthMethod.OIDC_AUTH, defaultOidcAuth),
  Gcp: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityGcpAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityGcpAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultGcpAuth>
  >(IdentityAuthMethod.GCP_AUTH, defaultGcpAuth),
  Azure: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityAzureAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityAzureAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultAzureAuth>
  >(IdentityAuthMethod.AZURE_AUTH, defaultAzureAuth),
  AliCloud: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityAliCloudAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityAliCloudAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultAliCloudAuth>
  >(IdentityAuthMethod.ALICLOUD_AUTH, defaultAliCloudAuth),
  Oci: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityOciAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityOciAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultOciAuth>
  >(IdentityAuthMethod.OCI_AUTH, defaultOciAuth),
  Ldap: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityLdapAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityLdapAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultLdapAuth>
  >(IdentityAuthMethod.LDAP_AUTH, defaultLdapAuth),
  Jwt: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityJwtAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityJwtAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultJwtAuth>
  >(IdentityAuthMethod.JWT_AUTH, defaultJwtAuth),
  TlsCert: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentityTlsCertAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentityTlsCertAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultTlsCertAuth>
  >(IdentityAuthMethod.TLS_CERT_AUTH, defaultTlsCertAuth),
  Spiffe: authMethodAdapter<
    Parameters<ReturnType<AccessAdapter["useAddIdentitySpiffeAuth"]>["mutateAsync"]>[0],
    Parameters<ReturnType<AccessAdapter["useUpdateIdentitySpiffeAuth"]>["mutateAsync"]>[0],
    ReturnType<typeof defaultSpiffeAuth>
  >(IdentityAuthMethod.SPIFFE_AUTH, defaultSpiffeAuth)
};

const page = <T>(rows: T[], offset = 0, limit = 100) => rows.slice(offset, offset + limit);

const direction = (value?: string) => (value === OrderByDirection.DESC ? -1 : 1);

const removeUserEverywhere = (state: AccessState, userIds: readonly string[]): AccessState => ({
  ...state,
  orgMemberships: state.orgMemberships.filter((entry) => !userIds.includes(entry.userId)),
  groupMembers: state.groupMembers.filter(
    (entry) => !entry.userId || !userIds.includes(entry.userId)
  ),
  projectMemberships: state.projectMemberships.filter(
    (entry) => entry.kind !== "user" || !userIds.includes(entry.userId)
  )
});

const ALL_RULE = [{ action: "manage", subject: "all" }];
const scenarioRules = (scenario: AccessScenario, blocked: string[]) => {
  if (scenario === "denied") return [];
  if (scenario === "read-only") return [{ action: "read", subject: "all" }];
  if (scenario === "restricted")
    return [
      ...ALL_RULE,
      ...blocked.map((subject) => ({ action: "manage", subject, inverted: true }))
    ];
  return ALL_RULE;
};

const organization = (state: AccessState, subOrganization: boolean): Organization => ({
  id: V4_DEMO_ORG_ID,
  name: state.subOrg ? "acme-eu" : "Acme Corp",
  createAt: "2025-01-04T12:00:00.000Z",
  updatedAt: "2026-10-30T12:00:00.000Z",
  authEnforced: false,
  googleSsoAuthEnforced: false,
  bypassOrgAuthEnabled: false,
  orgAuthMethod: "email",
  scimEnabled: false,
  slug: "acme",
  defaultMembershipRole: state.defaultMembershipRole,
  enforceMfa: false,
  ssoMfaTrust: SsoMfaTrust.None,
  shouldUseNewPrivilegeSystem: !state.legacyPrivileges,
  userRole: "admin",
  userJoinedAt: "2025-01-04T12:00:00.000Z",
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
  parentOrgId: subOrganization ? DEMO_ROOT_ORG_ID : null,
  rootOrgId: subOrganization ? DEMO_ROOT_ORG_ID : null,
  pamProjectId: null
});

const useDemoOrganization = demoQuery("organization", (state, subOrganization: boolean) =>
  organization(state, subOrganization)
);

const project = (state: AccessState, projectId: string): Project | undefined => {
  const found = projectOf(state, projectId);
  if (!found) return undefined;
  return {
    __v: 0,
    id: found.id,
    name: found.name,
    type: found.type,
    orgId: V4_DEMO_ORG_ID,
    version: ProjectVersion.V3,
    upgradeStatus: null,
    updatedAt: "2026-10-30T12:00:00.000Z",
    autoCapitalization: false,
    environments: found.environments,
    deletedEnvironments: [],
    pitVersionLimit: 10,
    auditLogsRetentionDays: 30,
    slug: found.id,
    createdAt: "2025-01-04T12:00:00.000Z",
    hasDeleteProtection: false,
    secretSharing: true,
    showSnapshotsLegacy: false,
    secretDetectionIgnoreValues: [],
    enforceEncryptedSecretManagerSecretMetadata: false,
    secretBlindIndexEnabled: false,
    isLegacyAdditionalPrivilegesEnabled: Boolean(found.legacyPrivileges)
  };
};

const DEMO_FOLDER_PATHS = [
  "/",
  "/payments",
  "/payments/stripe",
  "/payments/stripe/webhooks",
  "/payments/ledger",
  "/deploy",
  "/deploy/kubernetes",
  "/deploy/terraform",
  "/shared",
  "/shared/observability"
];

const environmentFolders = (
  state: AccessState,
  projectId: string
): TProjectEnvironmentsFolders | undefined => {
  const found = projectOf(state, projectId);
  if (!found) return undefined;
  return Object.fromEntries(
    found.environments.map((environment) => {
      const folders = DEMO_FOLDER_PATHS.map((path) => {
        const parent = path === "/" ? null : path.slice(0, path.lastIndexOf("/")) || "/";
        return {
          id: `${environment.slug}:${path}`,
          name: path === "/" ? "root" : path.slice(path.lastIndexOf("/") + 1),
          path,
          parentId: parent === null ? null : `${environment.slug}:${parent}`
        };
      });
      return [environment.slug, { ...environment, folders }];
    })
  );
};

const packed = (permissions: readonly TProjectPermission[] = []) =>
  packRules(permissions as RawRuleOf<MongoAbility>[]) as unknown[];

const isExpired = (grant: { isTemporary: boolean; temporaryAccessEndTime?: string | null }) =>
  grant.isTemporary &&
  Boolean(grant.temporaryAccessEndTime) &&
  new Date(grant.temporaryAccessEndTime ?? "").getTime() <= Date.now();

const roleSources = (
  state: AccessState,
  grants: readonly DemoRoleGrant[],
  group?: { id: string; name: string }
): TPermissionAuditSource[] =>
  grants.flatMap((grant) => {
    const role = state.projectRoles.find((entry) => entry.slug === grant.role);
    if (!role || isExpired(grant)) return [];
    return [
      {
        id: group ? `${group.id}:${grant.id}` : grant.id,
        type: group ? ("group_role" as const) : ("role" as const),
        name: role.name,
        slug: BUILT_IN_PROJECT_ROLES.includes(role.slug) ? role.slug : "custom",
        groupId: group?.id,
        groupName: group?.name,
        isTemporary: grant.isTemporary,
        temporaryAccessStartTime: grant.temporaryAccessStartTime,
        temporaryAccessEndTime: grant.temporaryAccessEndTime,
        permissions: packed(role.permissions)
      }
    ];
  });

const groupSources = (
  state: AccessState,
  projectId: string,
  member: { userId?: string; identityId?: string }
) =>
  membershipsOf(state, "group", projectId)
    .filter((membership) =>
      state.groupMembers.some(
        (entry) =>
          entry.groupId === membership.groupId &&
          (member.userId ? entry.userId === member.userId : entry.identityId === member.identityId)
      )
    )
    .flatMap((membership) => {
      const group = state.groups.find((entry) => entry.id === membership.groupId)!;
      return roleSources(state, membership.roles, group);
    });

const privilegeSources = (
  privileges: readonly {
    id: string;
    slug: string;
    isTemporary: boolean;
    temporaryAccessEndTime?: string | null;
    permissions?: TProjectPermission[];
  }[]
): TPermissionAuditSource[] =>
  privileges
    .filter((privilege) => !isExpired(privilege))
    .map((privilege) => ({
      id: privilege.id,
      type: "additional_privilege",
      name: privilege.slug,
      isTemporary: privilege.isTemporary,
      temporaryAccessEndTime: privilege.temporaryAccessEndTime ?? undefined,
      permissions: packed(privilege.permissions)
    }));

const privilegeWindow = (
  type:
    | { isTemporary: false }
    | { isTemporary: true; temporaryRange?: string; temporaryAccessStartTime?: string }
) => {
  if (!type.isTemporary) return { isTemporary: false as const };
  const start = type.temporaryAccessStartTime ?? stamp();
  const range = type.temporaryRange ?? "1h";
  return {
    isTemporary: true as const,
    temporaryMode: TEMPORARY_MODE as string,
    temporaryRange: range,
    temporaryAccessStartTime: start,
    temporaryAccessEndTime: new Date(
      new Date(start).getTime() + rangeSeconds(range) * 1000
    ).toISOString()
  };
};

const PRODUCT_ROLE_PROJECTS = new Set<ProjectType>([ProjectType.PAM, ProjectType.AgentVault]);

const projectRolesFor = (state: AccessState, projectId: string) => {
  const type = projectOf(state, projectId)?.type;
  const productRoles = PRODUCT_ROLE_PROJECTS.has(type as ProjectType);
  return state.projectRoles
    .filter((role) =>
      BUILT_IN_PROJECT_ROLES.includes(role.slug)
        ? !productRoles || role.slug === "admin" || role.slug === "member"
        : projectOf(state, role.projectId)?.type === type
    )
    .map((role) => ({ ...role, projectId }));
};

const addUserPerson = (
  state: AccessState,
  email: string
): { state: AccessState; person: DemoUser } => {
  const existing = state.users.find((entry) => entry.username === email);
  if (existing) return { state, person: existing };
  const person: DemoUser = {
    id: newId(),
    username: email,
    email,
    firstName: "",
    lastName: "",
    superAdmin: false,
    isEmailVerified: false
  };
  return { state: { ...state, users: [...state.users, person] }, person };
};

export const accessDemo: AccessAdapter = {
  useOrgPermission: () => {
    const scenario = useAccessScenario();
    const permission = createMongoAbility<OrgPermissionSet>(
      scenarioRules(scenario, ["groups", "role"]) as RawRuleOf<MongoAbility<OrgPermissionSet>>[]
    );
    const memberships =
      scenario === "read-only" || scenario === "denied" ? [] : [{ roles: [{ role: "admin" }] }];
    return {
      data: { permission, memberships: memberships as never[] },
      isPending: scenario === "loading",
      error: null
    };
  },
  useProjectPermission: () => {
    const scenario = useAccessScenario();
    const permission = createMongoAbility<ProjectPermissionSet>(
      scenarioRules(scenario, ["service-tokens", "role"]) as RawRuleOf<
        MongoAbility<ProjectPermissionSet>
      >[]
    );
    return {
      data: { permission, memberships: [], hasProjectAccess: scenario !== "denied" },
      isPending: scenario === "loading",
      error: null
    };
  },
  useOrganization: () => useDemoOrganization(useAccessScenario() === "sub-org"),
  useUpgradePrivilegeSystem: demoMutation((_dto: void, state) =>
    done({ ...state, legacyPrivileges: false }, {} as never)
  ),
  useUpdateOrganization: demoMutation((dto, state) =>
    done(
      {
        ...state,
        defaultMembershipRole: dto.defaultMembershipRoleSlug ?? state.defaultMembershipRole
      },
      {}
    )
  ),
  useProject: demoQuery("project", (state, projectId: string) => project(state, projectId)),
  usePamProjectId: demoQuery("pam-project-id", () => DEMO_PAM_PROJECT_ID),

  useOrgUsers: demoQuery("org-users", (state) => orgUserAccess(state)),
  useOrgMembership: demoQuery("org-membership", (state, _orgId: string, membershipId: string) =>
    orgMembershipDetail(state, membershipId)
  ),
  useOrgMembershipProjectMemberships: demoQuery(
    "org-membership-projects",
    (state, _orgId: string, membershipId: string) => {
      const membership = state.orgMemberships.find((entry) => entry.id === membershipId);
      if (!membership) return undefined;
      const memberships = membershipsOf(state, "user")
        .filter((entry) => entry.userId === membership.userId)
        .map((entry) => workspaceUser(state, entry));
      return { memberships, totalCount: memberships.length };
    }
  ),
  useUserGroupMemberships: demoQuery("user-groups", (state, username: string) => {
    const person = state.users.find((entry) => entry.username === username);
    if (!person) return [];
    return state.groupMembers
      .filter((entry) => entry.userId === person.id)
      .map((entry) => state.groups.find((group) => group.id === entry.groupId)!)
      .map((group) => ({
        id: group.id,
        name: group.name,
        slug: group.slug,
        orgId: V4_DEMO_ORG_ID
      }));
  }),
  useInviteOrgUsers: demoMutation((dto, initial) => {
    let state = initial;
    dto.inviteeEmails.forEach((email) => {
      const added = addUserPerson(state, email);
      state = added.state;
      if (state.orgMemberships.some((entry) => entry.userId === added.person.id)) return;
      state = {
        ...state,
        orgMemberships: [
          ...state.orgMemberships,
          {
            id: newId(),
            userId: added.person.id,
            ...orgRoleRef(state, dto.organizationRoleSlug),
            status: "invited",
            isActive: true,
            metadata: [],
            createdAt: stamp()
          }
        ],
        projectMemberships: [
          ...state.projectMemberships,
          ...(dto.projectIds ?? []).map((projectId): DemoProjectMembership => ({
            kind: "user",
            id: newId(),
            projectId,
            userId: added.person.id,
            roles: [{ id: newId(), role: "member", isTemporary: false }],
            createdAt: stamp()
          }))
        ]
      };
    });
    return done(state, { data: { message: "Invited users" } });
  }),
  useUpdateOrgMembership: demoMutation((dto, state) =>
    done(
      {
        ...state,
        orgMemberships: state.orgMemberships.map((entry) =>
          entry.id === dto.membershipId
            ? {
                ...entry,
                ...(dto.role ? orgRoleRef(state, dto.role) : {}),
                isActive: dto.isActive ?? entry.isActive,
                metadata: dto.metadata
                  ? dto.metadata.map((item) => ({ ...item, id: newId() }))
                  : entry.metadata
              }
            : entry
        )
      },
      {}
    )
  ),
  useDeleteOrgMembership: demoMutation((dto, state) => {
    const userIds = state.orgMemberships
      .filter((entry) => entry.id === dto.membershipId)
      .map((entry) => entry.userId);
    return done(removeUserEverywhere(state, userIds), {});
  }),
  useDeleteOrgMemberships: demoMutation((dto, state) => {
    const userIds = state.orgMemberships
      .filter((entry) => dto.membershipIds.includes(entry.id))
      .map((entry) => entry.userId);
    return done(removeUserEverywhere(state, userIds), {});
  }),
  useResendOrgInvite: demoMutation((dto, state) => {
    const membership = state.orgMemberships.find((entry) => entry.id === dto.membershipId);
    const person = membership && userOf(state, membership.userId);
    return done(
      state,
      person
        ? {
            email: person.email,
            link: `https://app.infisical.com/signupinvite?token=demo-${membership.id}`
          }
        : undefined
    );
  }),

  useAvailableOrgUsers: demoQuery("available-org-users", (state) =>
    DEMO_ROOT_ORG_USERS.filter(
      (candidate) => !state.users.some((entry) => entry.username === candidate.username)
    )
  ),

  useOrgRoles: demoQuery("org-roles", (state) => state.orgRoles),
  useOrgRole: demoQuery("org-role", (state, _orgId: string, roleId: string) =>
    state.orgRoles.find((role) => role.id === roleId)
  ),
  useCreateOrgRole: demoMutation(({ orgId, ...dto }, state) => {
    const role: TOrgRole = {
      ...dto,
      id: newId(),
      orgId,
      description: dto.description ?? undefined,
      createdAt: stamp(),
      updatedAt: stamp()
    };
    return done({ ...state, orgRoles: [...state.orgRoles, role] }, role);
  }),
  useUpdateOrgRole: demoMutation(({ id, orgId: _orgId, ...patch }, state) => {
    const current = state.orgRoles.find((role) => role.id === id)!;
    const next: TOrgRole = {
      ...current,
      ...patch,
      description:
        patch.description === null ? undefined : (patch.description ?? current.description),
      updatedAt: stamp()
    };
    return done(
      { ...state, orgRoles: state.orgRoles.map((role) => (role.id === id ? next : role)) },
      next
    );
  }),
  useDeleteOrgRole: demoMutation(({ id }, state) => {
    const removed = state.orgRoles.find((role) => role.id === id)!;
    return done({ ...state, orgRoles: state.orgRoles.filter((role) => role.id !== id) }, removed);
  }),

  useSearchOrgIdentities: demoQuery(
    "org-identities",
    (state, { limit, offset, orderBy, orderDirection, scope, search }) => {
      const scopes = scope ?? [SearchIdentitiesScope.OrganizationScope];
      const name =
        search.name?.$contains ?? search.$or?.find((entry) => entry.name)?.name?.$contains;
      const role =
        search.role?.$contains ?? search.$or?.find((entry) => entry.role)?.role?.$contains;
      const matches = identitySearchRows(state)
        .filter((row) => scopes.includes(row.scope))
        .filter((row) =>
          search.$or
            ? contains(row.identity.name, name) || contains(roleLabel(row), role)
            : contains(row.identity.name, name) && contains(roleLabel(row), role)
        )
        .sort((a, b) => {
          const order = direction(orderDirection);
          if (orderBy === OrgIdentityOrderBy.Role)
            return roleLabel(a).localeCompare(roleLabel(b)) * order;
          if (orderBy === OrgIdentityOrderBy.LastLogin)
            return (a.lastLoginTime ?? "").localeCompare(b.lastLoginTime ?? "") * order;
          return a.identity.name.localeCompare(b.identity.name) * order;
        });
      return { identities: page(matches, offset, limit), totalCount: matches.length };
    }
  ),
  useOrgIdentity: demoQuery("org-identity", (state, identityId: string) =>
    identityOrgDetail(state, identityId)
  ),
  useIdentityProjectMemberships: demoQuery("identity-projects", (state, identityId: string) => {
    const identityMemberships = membershipsOf(state, "identity")
      .filter((entry) => entry.identityId === identityId)
      .map((entry) => identityProjectMembership(state, entry));
    return { identityMemberships, totalCount: identityMemberships.length };
  }),
  useCreateOrgIdentity: demoMutation((dto, state) => {
    const identity = {
      id: newId(),
      name: dto.name,
      hasDeleteProtection: dto.hasDeleteProtection,
      authMethods: [],
      activeLockoutAuthMethods: [],
      createdAt: stamp(),
      updatedAt: stamp(),
      orgId: V4_DEMO_ORG_ID,
      projectId: null,
      metadata: (dto.metadata ?? []).map((item) => ({ ...item, id: newId() }))
    };
    const ref = orgRoleRef(state, dto.role ?? state.defaultMembershipRole);
    return done(
      {
        ...state,
        identities: [...state.identities, identity],
        identityOrgMemberships: [
          ...state.identityOrgMemberships,
          {
            id: newId(),
            identityId: identity.id,
            role: ref.role,
            roleId: ref.role === "custom" ? ref.roleId : undefined,
            createdAt: identity.createdAt
          }
        ]
      },
      identity
    );
  }),
  useUpdateOrgIdentity: demoMutation((dto, state) => {
    const current = identityOf(state, dto.identityId)!;
    const next = {
      ...current,
      name: dto.name ?? current.name,
      hasDeleteProtection: dto.hasDeleteProtection ?? current.hasDeleteProtection,
      metadata: dto.metadata
        ? dto.metadata.map((item) => ({ ...item, id: newId() }))
        : current.metadata,
      updatedAt: stamp()
    };
    const ref = dto.role ? orgRoleRef(state, dto.role) : undefined;
    return done(
      {
        ...state,
        identities: state.identities.map((entry) => (entry.id === next.id ? next : entry)),
        identityOrgMemberships: state.identityOrgMemberships.map((entry) =>
          entry.identityId === next.id && ref
            ? { ...entry, role: ref.role, roleId: ref.role === "custom" ? ref.roleId : undefined }
            : entry
        )
      },
      next
    );
  }),
  useAvailableOrgIdentities: demoQuery("available-org-identities", (state) =>
    DEMO_ROOT_ORG_IDENTITIES.filter(
      (candidate) => !state.identities.some((entry) => entry.id === candidate.id)
    )
  ),
  useCreateOrgIdentityMembership: demoMutation(({ identityId, roles }, state) => {
    const linked = DEMO_ROOT_ORG_IDENTITIES.find((entry) => entry.id === identityId)!;
    const ref = orgRoleRef(state, roles[0]?.role ?? state.defaultMembershipRole);
    const membership = {
      id: newId(),
      identityId,
      role: ref.role,
      roleId: ref.role === "custom" ? ref.roleId : undefined,
      createdAt: stamp()
    };
    return done(
      {
        ...state,
        identities: [
          ...state.identities,
          {
            id: linked.id,
            name: linked.name,
            hasDeleteProtection: false,
            authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH],
            activeLockoutAuthMethods: [],
            createdAt: stamp(),
            updatedAt: stamp(),
            orgId: DEMO_ROOT_ORG_ID,
            projectId: null,
            metadata: []
          }
        ],
        identityOrgMemberships: [...state.identityOrgMemberships, membership]
      },
      { ...membership, orgId: V4_DEMO_ORG_ID, updatedAt: membership.createdAt }
    );
  }),
  useDeleteOrgIdentity: demoMutation(({ identityId }, state) => {
    const removed = identityOf(state, identityId)!;
    return done(
      {
        ...state,
        identities: state.identities.filter((entry) => entry.id !== identityId),
        identityOrgMemberships: state.identityOrgMemberships.filter(
          (entry) => entry.identityId !== identityId
        ),
        groupMembers: state.groupMembers.filter((entry) => entry.identityId !== identityId),
        projectMemberships: state.projectMemberships.filter(
          (entry) => entry.kind !== "identity" || entry.identityId !== identityId
        )
      },
      { identity: toTIdentity(removed) }
    );
  }),
  useIdentityUniversalAuth: demoQuery("universal-auth", (state, identityId: string) =>
    identityOf(state, identityId)?.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)
      ? (state.universalAuth[identityId] ?? defaultUniversalAuth(identityId))
      : undefined
  ),
  useIdentityUniversalAuthClientSecrets: demoQuery(
    "universal-auth-secrets",
    (state, identityId: string) => state.clientSecrets[identityId] ?? []
  ),
  useAddIdentityUniversalAuth: demoMutation((dto, state) => {
    const ips = toTrustedIps;
    const config = {
      ...defaultUniversalAuth(dto.identityId),
      ...dto,
      clientSecretTrustedIps: ips(dto.clientSecretTrustedIps),
      accessTokenTrustedIps: ips(dto.accessTokenTrustedIps)
    };
    return done(
      {
        ...state,
        universalAuth: { ...state.universalAuth, [dto.identityId]: config },
        identities: state.identities.map((entry) =>
          entry.id === dto.identityId
            ? { ...entry, authMethods: [...entry.authMethods, IdentityAuthMethod.UNIVERSAL_AUTH] }
            : entry
        )
      },
      config
    );
  }),
  useUpdateIdentityUniversalAuth: demoMutation((dto, state) => {
    const current = state.universalAuth[dto.identityId] ?? defaultUniversalAuth(dto.identityId);
    const ips = (list?: { ipAddress: string }[]) => (list ? toTrustedIps(list) : undefined);
    const next = {
      ...current,
      accessTokenTTL: dto.accessTokenTTL ?? current.accessTokenTTL,
      accessTokenMaxTTL: dto.accessTokenMaxTTL ?? current.accessTokenMaxTTL,
      accessTokenNumUsesLimit: dto.accessTokenNumUsesLimit ?? current.accessTokenNumUsesLimit,
      accessTokenPeriod: dto.accessTokenPeriod ?? current.accessTokenPeriod,
      lockoutEnabled: dto.lockoutEnabled ?? current.lockoutEnabled,
      lockoutThreshold: dto.lockoutThreshold ?? current.lockoutThreshold,
      lockoutDurationSeconds: dto.lockoutDurationSeconds ?? current.lockoutDurationSeconds,
      lockoutCounterResetSeconds:
        dto.lockoutCounterResetSeconds ?? current.lockoutCounterResetSeconds,
      clientSecretTrustedIps: ips(dto.clientSecretTrustedIps) ?? current.clientSecretTrustedIps,
      accessTokenTrustedIps: ips(dto.accessTokenTrustedIps) ?? current.accessTokenTrustedIps
    };
    return done(
      { ...state, universalAuth: { ...state.universalAuth, [dto.identityId]: next } },
      next
    );
  }),
  useDeleteIdentityUniversalAuth: demoMutation((dto, state) => {
    const removed = state.universalAuth[dto.identityId] ?? defaultUniversalAuth(dto.identityId);
    const { [dto.identityId]: _removed, ...universalAuth } = state.universalAuth;
    return done(
      {
        ...state,
        universalAuth,
        identities: state.identities.map((entry) =>
          entry.id === dto.identityId
            ? {
                ...entry,
                authMethods: entry.authMethods.filter(
                  (method) => method !== IdentityAuthMethod.UNIVERSAL_AUTH
                ),
                activeLockoutAuthMethods: entry.activeLockoutAuthMethods.filter(
                  (method) => method !== IdentityAuthMethod.UNIVERSAL_AUTH
                )
              }
            : entry
        )
      },
      removed
    );
  }),
  useCreateIdentityUniversalAuthClientSecret: demoMutation((dto, state) => {
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const clientSecretData = {
      id: newId(),
      identityUniversalAuth: dto.identityId,
      isClientSecretRevoked: false,
      description: dto.description ?? "",
      clientSecretPrefix: secret.slice(0, 4),
      clientSecretNumUses: 0,
      clientSecretNumUsesLimit: dto.numUsesLimit ?? 0,
      clientSecretTTL: dto.ttl ?? 0,
      createdAt: stamp(),
      updatedAt: stamp()
    };
    return done(
      {
        ...state,
        clientSecrets: {
          ...state.clientSecrets,
          [dto.identityId]: [...(state.clientSecrets[dto.identityId] ?? []), clientSecretData]
        }
      },
      { clientSecret: secret, clientSecretData }
    );
  }),
  useRevokeIdentityUniversalAuthClientSecret: demoMutation((dto, state) => {
    const list = state.clientSecrets[dto.identityId] ?? [];
    const removed = list.find((entry) => entry.id === dto.clientSecretId)!;
    return done(
      {
        ...state,
        clientSecrets: {
          ...state.clientSecrets,
          [dto.identityId]: list.filter((entry) => entry.id !== dto.clientSecretId)
        }
      },
      removed
    );
  }),
  useClearIdentityUniversalAuthLockouts: demoMutation((dto, state) =>
    done(
      {
        ...state,
        identities: state.identities.map((entry) =>
          entry.id === dto.identityId
            ? {
                ...entry,
                activeLockoutAuthMethods: entry.activeLockoutAuthMethods.filter(
                  (method) => method !== IdentityAuthMethod.UNIVERSAL_AUTH
                )
              }
            : entry
        )
      },
      1
    )
  ),
  useIdentityAuthTemplates: demoQuery("auth-templates", (state, dto) => {
    const matches = state.authTemplates.filter((template) => contains(template.name, dto.search));
    return {
      templates: page(matches, dto.offset, dto.limit ?? 50),
      totalCount: matches.length
    };
  }),
  useIdentityAuthTemplateUsages: demoQuery("auth-template-usages", (state, dto) =>
    (state.templateUsages[dto.templateId] ?? []).map((identityId) => ({
      identityId,
      identityName: identityOf(state, identityId)?.name ?? identityId
    }))
  ),
  useCreateIdentityAuthTemplate: demoMutation((dto, state) => {
    const template = {
      id: newId(),
      name: dto.name,
      authMethod: dto.authMethod,
      organizationId: dto.organizationId,
      templateFields: dto.templateFields,
      createdAt: stamp(),
      updatedAt: stamp()
    } as AccessState["authTemplates"][number];
    return done({ ...state, authTemplates: [...state.authTemplates, template] }, template);
  }),
  useUpdateIdentityAuthTemplate: demoMutation((dto, state) => {
    const current = state.authTemplates.find((entry) => entry.id === dto.templateId)!;
    const next = {
      ...current,
      name: dto.name ?? current.name,
      templateFields: { ...current.templateFields, ...dto.templateFields },
      updatedAt: stamp()
    } as AccessState["authTemplates"][number];
    return done(
      {
        ...state,
        authTemplates: state.authTemplates.map((entry) => (entry.id === next.id ? next : entry))
      },
      next
    );
  }),
  useDeleteIdentityAuthTemplate: demoMutation((dto, state) =>
    done(
      {
        ...state,
        authTemplates: state.authTemplates.filter((entry) => entry.id !== dto.templateId)
      },
      undefined
    )
  ),
  useCountOrgIdentities: demoQuery("org-identity-counts", (state, { scope, search }) => {
    const matches = identitySearchRows(state).filter(
      (row) => scope.includes(row.scope) && identitySearchMatches(row, search)
    );
    return {
      organization: matches.filter((row) => row.scope === SearchIdentitiesScope.OrganizationScope)
        .length,
      project: matches.filter((row) => row.scope === SearchIdentitiesScope.ProjectScope).length
    };
  }),
  useIdentityTokenAuth: authMethods.Token.query,
  useAddIdentityTokenAuth: authMethods.Token.add,
  useUpdateIdentityTokenAuth: authMethods.Token.update,
  useDeleteIdentityTokenAuth: authMethods.Token.remove,
  useIdentityKubernetesAuth: authMethods.Kubernetes.query,
  useAddIdentityKubernetesAuth: authMethods.Kubernetes.add,
  useUpdateIdentityKubernetesAuth: authMethods.Kubernetes.update,
  useDeleteIdentityKubernetesAuth: authMethods.Kubernetes.remove,
  useIdentityAwsAuth: authMethods.Aws.query,
  useAddIdentityAwsAuth: authMethods.Aws.add,
  useUpdateIdentityAwsAuth: authMethods.Aws.update,
  useDeleteIdentityAwsAuth: authMethods.Aws.remove,
  useIdentityOidcAuth: authMethods.Oidc.query,
  useAddIdentityOidcAuth: authMethods.Oidc.add,
  useUpdateIdentityOidcAuth: authMethods.Oidc.update,
  useDeleteIdentityOidcAuth: authMethods.Oidc.remove,
  useIdentityGcpAuth: authMethods.Gcp.query,
  useAddIdentityGcpAuth: authMethods.Gcp.add,
  useUpdateIdentityGcpAuth: authMethods.Gcp.update,
  useDeleteIdentityGcpAuth: authMethods.Gcp.remove,
  useIdentityAzureAuth: authMethods.Azure.query,
  useAddIdentityAzureAuth: authMethods.Azure.add,
  useUpdateIdentityAzureAuth: authMethods.Azure.update,
  useDeleteIdentityAzureAuth: authMethods.Azure.remove,
  useIdentityAliCloudAuth: authMethods.AliCloud.query,
  useAddIdentityAliCloudAuth: authMethods.AliCloud.add,
  useUpdateIdentityAliCloudAuth: authMethods.AliCloud.update,
  useDeleteIdentityAliCloudAuth: authMethods.AliCloud.remove,
  useIdentityOciAuth: authMethods.Oci.query,
  useAddIdentityOciAuth: authMethods.Oci.add,
  useUpdateIdentityOciAuth: authMethods.Oci.update,
  useDeleteIdentityOciAuth: authMethods.Oci.remove,
  useIdentityLdapAuth: authMethods.Ldap.query,
  useAddIdentityLdapAuth: authMethods.Ldap.add,
  useUpdateIdentityLdapAuth: authMethods.Ldap.update,
  useDeleteIdentityLdapAuth: authMethods.Ldap.remove,
  useIdentityJwtAuth: authMethods.Jwt.query,
  useAddIdentityJwtAuth: authMethods.Jwt.add,
  useUpdateIdentityJwtAuth: authMethods.Jwt.update,
  useDeleteIdentityJwtAuth: authMethods.Jwt.remove,
  useIdentityTlsCertAuth: authMethods.TlsCert.query,
  useAddIdentityTlsCertAuth: authMethods.TlsCert.add,
  useUpdateIdentityTlsCertAuth: authMethods.TlsCert.update,
  useDeleteIdentityTlsCertAuth: authMethods.TlsCert.remove,
  useIdentitySpiffeAuth: authMethods.Spiffe.query,
  useAddIdentitySpiffeAuth: authMethods.Spiffe.add,
  useUpdateIdentitySpiffeAuth: authMethods.Spiffe.update,
  useDeleteIdentitySpiffeAuth: authMethods.Spiffe.remove,
  useIdentityTokenAuthTokens: demoQuery(
    "token-auth-tokens",
    (state, identityId: string) => state.tokenAuthTokens[identityId] ?? []
  ),
  useCreateIdentityTokenAuthToken: demoMutation((dto, state) => {
    const accessToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const tokenData = {
      id: newId(),
      name: dto.name,
      identityId: dto.identityId,
      accessTokenTTL: 2592000,
      accessTokenMaxTTL: 2592000,
      accessTokenNumUses: 0,
      accessTokenNumUsesLimit: 0,
      accessTokenLastUsedAt: null,
      accessTokenLastRenewedAt: null,
      isAccessTokenRevoked: false,
      identityUAClientSecretId: null,
      createdAt: stamp(),
      updatedAt: stamp()
    };
    return done(
      {
        ...state,
        tokenAuthTokens: {
          ...state.tokenAuthTokens,
          [dto.identityId]: [...(state.tokenAuthTokens[dto.identityId] ?? []), tokenData]
        }
      },
      { accessToken, tokenData }
    );
  }),
  useRevokeIdentityTokenAuthToken: demoMutation((dto, state) =>
    done(
      {
        ...state,
        tokenAuthTokens: {
          ...state.tokenAuthTokens,
          [dto.identityId]: (state.tokenAuthTokens[dto.identityId] ?? []).filter(
            (entry) => entry.id !== dto.tokenId
          )
        }
      },
      { message: "Successfully revoked access token" }
    )
  ),
  useUpdateIdentityTokenAuthToken: demoMutation((dto, state) => {
    const list = state.tokenAuthTokens[dto.identityId] ?? [];
    const current = list.find((entry) => entry.id === dto.tokenId)!;
    const next = { ...current, name: dto.name ?? current.name, updatedAt: stamp() };
    return done(
      {
        ...state,
        tokenAuthTokens: {
          ...state.tokenAuthTokens,
          [dto.identityId]: list.map((entry) => (entry.id === next.id ? next : entry))
        }
      },
      next
    );
  }),
  useClearIdentityLdapAuthLockouts: demoMutation((dto, state) =>
    done(
      {
        ...state,
        identities: state.identities.map((entry) =>
          entry.id === dto.identityId
            ? {
                ...entry,
                activeLockoutAuthMethods: entry.activeLockoutAuthMethods.filter(
                  (method) => method !== IdentityAuthMethod.LDAP_AUTH
                )
              }
            : entry
        )
      },
      1
    )
  ),
  useIdentityAccessTokenMaxTtl: () => MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK,
  useAvailableIdentityAuthTemplates: demoQuery(
    "available-auth-templates",
    (state, authMethod: MachineIdentityAuthMethod) =>
      state.authTemplates.filter((template) => template.authMethod === authMethod)
  ),

  useOrgGroups: demoQuery(
    "org-groups",
    (state, { offset, limit, search, roles, orderDirection }) => {
      const matches = state.groups
        .filter((group) => contains(group.name, search) || contains(group.slug, search))
        .filter((group) => {
          if (!roles?.length) return true;
          const slug = orgRoleOf(state, group.role, group.roleId)?.slug ?? group.role;
          return roles.includes(slug);
        })
        .sort((a, b) => a.name.localeCompare(b.name) * direction(orderDirection))
        .map((group) => ({
          orgId: V4_DEMO_ORG_ID,
          ...group,
          updatedAt: group.createdAt,
          customRole: group.role === "custom" ? orgRoleOf(state, "custom", group.roleId) : undefined
        }));
      return { groups: page(matches, offset, limit), totalCount: matches.length };
    }
  ),
  useGroup: demoQuery("group", (state, groupId: string) => {
    const group = state.groups.find((entry) => entry.id === groupId);
    return group && { group: { orgId: V4_DEMO_ORG_ID, ...group, updatedAt: group.createdAt } };
  }),
  useGroupMembers: demoQuery(
    "group-members",
    (state, { id, offset, limit, search, orderDirection, memberTypeFilter }) => {
      const members = state.groupMembers
        .filter((entry) => entry.groupId === id)
        .map((entry) => {
          if (entry.userId) {
            const person = userOf(state, entry.userId);
            return {
              id: person.id,
              joinedGroupAt: new Date(entry.joinedGroupAt),
              type: GroupMemberType.USER as const,
              user: {
                email: person.email,
                username: person.username,
                firstName: person.firstName,
                lastName: person.lastName
              }
            };
          }
          const identity = identityOf(state, entry.identityId!)!;
          return {
            id: identity.id,
            joinedGroupAt: new Date(entry.joinedGroupAt),
            type: GroupMemberType.MACHINE_IDENTITY as const,
            machineIdentity: { id: identity.id, name: identity.name }
          };
        })
        .filter(
          (member) =>
            !memberTypeFilter?.length ||
            memberTypeFilter.includes(
              member.type === GroupMemberType.USER
                ? ("users" as never)
                : ("machineIdentities" as never)
            )
        );
      const label = (member: (typeof members)[number]) =>
        member.type === GroupMemberType.USER
          ? `${member.user.firstName} ${member.user.lastName} ${member.user.email}`
          : member.machineIdentity.name;
      const matches = members
        .filter((member) => contains(label(member), search))
        .sort((a, b) => label(a).localeCompare(label(b)) * direction(orderDirection));
      return { members: page(matches, offset, limit), totalCount: matches.length };
    }
  ),
  useGroupProjects: demoQuery("group-projects", (state, groupId: string) =>
    membershipsOf(state, "group")
      .filter((entry) => entry.groupId === groupId)
      .map((entry) => {
        const found = projectOf(state, entry.projectId)!;
        return {
          id: found.id,
          name: found.name,
          slug: found.id,
          description: "",
          type: found.type,
          joinedGroupAt: new Date(entry.createdAt)
        };
      })
  ),
  useCreateGroup: demoMutation((dto, state) => {
    const group = {
      id: newId(),
      name: dto.name,
      slug: dto.slug,
      ...orgRoleRef(state, dto.role ?? state.defaultMembershipRole),
      createdAt: stamp()
    };
    return done(
      { ...state, groups: [...state.groups, group] },
      { orgId: V4_DEMO_ORG_ID, ...group, updatedAt: group.createdAt }
    );
  }),
  useUpdateGroup: demoMutation((dto, state) => {
    const current = state.groups.find((entry) => entry.id === dto.id)!;
    const next = {
      ...current,
      name: dto.name ?? current.name,
      slug: dto.slug ?? current.slug,
      ...(dto.role ? orgRoleRef(state, dto.role) : {})
    };
    return done(
      { ...state, groups: state.groups.map((entry) => (entry.id === next.id ? next : entry)) },
      { orgId: V4_DEMO_ORG_ID, ...next, updatedAt: stamp() }
    );
  }),
  useDeleteGroup: demoMutation((dto, state) => {
    const removed = state.groups.find((entry) => entry.id === dto.id)!;
    return done(
      {
        ...state,
        groups: state.groups.filter((entry) => entry.id !== dto.id),
        groupMembers: state.groupMembers.filter((entry) => entry.groupId !== dto.id),
        projectMemberships: state.projectMemberships.filter(
          (entry) => entry.kind !== "group" || entry.groupId !== dto.id
        )
      },
      { orgId: V4_DEMO_ORG_ID, ...removed, updatedAt: removed.createdAt }
    );
  }),
  useAddUserToGroup: demoMutation((dto, state) => {
    const person = state.users.find((entry) => entry.username === dto.username)!;
    const group = state.groups.find((entry) => entry.id === dto.groupId)!;
    return done(
      {
        ...state,
        groupMembers: [
          ...state.groupMembers,
          { groupId: dto.groupId, userId: person.id, joinedGroupAt: stamp() }
        ]
      },
      { orgId: V4_DEMO_ORG_ID, ...group, updatedAt: group.createdAt }
    );
  }),
  useRemoveUserFromGroup: demoMutation((dto, state) => {
    const person = state.users.find((entry) => entry.username === dto.username);
    const group = state.groups.find((entry) => entry.id === dto.groupId)!;
    return done(
      {
        ...state,
        groupMembers: state.groupMembers.filter(
          (entry) => entry.groupId !== dto.groupId || entry.userId !== person?.id
        )
      },
      { orgId: V4_DEMO_ORG_ID, ...group, updatedAt: group.createdAt }
    );
  }),
  useAddIdentityToGroup: demoMutation((dto, state) => {
    const identity = identityOf(state, dto.identityId)!;
    return done(
      {
        ...state,
        groupMembers: [
          ...state.groupMembers,
          { groupId: dto.groupId, identityId: dto.identityId, joinedGroupAt: stamp() }
        ]
      },
      { id: identity.id, name: identity.name }
    );
  }),
  useAvailableOrgGroups: demoQuery("available-org-groups", (state) =>
    DEMO_ROOT_ORG_GROUPS.filter(
      (candidate) => !state.groups.some((entry) => entry.id === candidate.id)
    )
  ),
  useCreateOrgGroupMembership: demoMutation(({ groupId, roles }, state) => {
    const linked = DEMO_ROOT_ORG_GROUPS.find((entry) => entry.id === groupId)!;
    const group = {
      ...linked,
      ...orgRoleRef(state, roles[0]?.role ?? state.defaultMembershipRole),
      createdAt: stamp(),
      orgId: DEMO_ROOT_ORG_ID
    };
    return done(
      { ...state, groups: [...state.groups, group] },
      {
        id: newId(),
        orgId: V4_DEMO_ORG_ID,
        groupId,
        createdAt: group.createdAt,
        updatedAt: group.createdAt
      }
    );
  }),
  useOidcManageGroupMemberships: demoQuery("oidc-group-memberships", (state) =>
    Boolean(state.oidcGroupMemberships)
  ),
  useRemoveIdentityFromGroup: demoMutation((dto, state) => {
    const identity = identityOf(state, dto.identityId)!;
    return done(
      {
        ...state,
        groupMembers: state.groupMembers.filter(
          (entry) => entry.groupId !== dto.groupId || entry.identityId !== dto.identityId
        )
      },
      { id: identity.id, name: identity.name }
    );
  }),

  useProjectUsers: demoQuery(
    "project-users",
    (state, projectId: string, includeGroupMembers?: boolean, roles?: string[]) => {
      const direct = membershipsOf(state, "user", projectId).map((entry) =>
        workspaceUser(state, entry)
      );
      const viaGroups = includeGroupMembers
        ? membershipsOf(state, "group", projectId).flatMap((entry) =>
            state.groupMembers
              .filter(
                (member) =>
                  member.groupId === entry.groupId &&
                  member.userId &&
                  !direct.some((user) => user.user.id === member.userId)
              )
              .map((member) =>
                workspaceUser(
                  state,
                  {
                    ...entry,
                    kind: "user",
                    id: `${entry.id}-${member.userId}`,
                    userId: member.userId!
                  },
                  true
                )
              )
          )
        : [];
      return [...direct, ...viaGroups].filter(
        (entry) =>
          !roles?.length ||
          entry.roles.some((role) => roles.includes(role.customRoleSlug || role.role))
      );
    }
  ),
  useProjectUser: demoQuery("project-user", (state, projectId: string, membershipId: string) => {
    const membership = membershipsOf(state, "user", projectId).find(
      (entry) => entry.id === membershipId
    );
    return membership && workspaceUser(state, membership);
  }),
  useAvailableProjectUsers: demoQuery("available-project-users", (state, projectId: string) =>
    state.orgMemberships
      .map((entry) => userOf(state, entry.userId))
      .filter(
        (person) =>
          !membershipsOf(state, "user", projectId).some((entry) => entry.userId === person.id)
      )
      .map((person) => ({
        id: person.id,
        username: person.username,
        email: person.email,
        firstName: person.firstName,
        lastName: person.lastName
      }))
  ),
  useAddProjectUsers: demoMutation((dto, state) => {
    const added = dto.usernames
      .map((username) => state.users.find((entry) => entry.username === username))
      .filter((person): person is DemoUser => Boolean(person))
      .map((person): DemoProjectMembership => ({
        kind: "user",
        id: newId(),
        projectId: dto.projectId,
        userId: person.id,
        roles: (dto.roleSlugs?.length ? dto.roleSlugs : ["member"]).map((role) => ({
          id: newId(),
          role,
          isTemporary: false
        })),
        createdAt: stamp()
      }));
    return done(
      { ...state, projectMemberships: [...state.projectMemberships, ...added] },
      { memberships: added.map((entry) => ({ id: entry.id })) }
    );
  }),
  useUpdateProjectUserRoles: demoMutation((dto, state) =>
    done(
      {
        ...state,
        projectMemberships: state.projectMemberships.map((entry) =>
          entry.kind === "user" && entry.id === dto.membershipId
            ? { ...entry, roles: toGrants(dto.roles) }
            : entry
        )
      },
      { projectId: dto.projectId }
    )
  ),
  useRemoveProjectUsers: demoMutation((dto, state) => {
    const userIds = state.users
      .filter((person) => dto.usernames.includes(person.username))
      .map((person) => person.id);
    return done(
      {
        ...state,
        projectMemberships: state.projectMemberships.filter(
          (entry) =>
            entry.kind !== "user" ||
            entry.projectId !== dto.projectId ||
            !userIds.includes(entry.userId)
        )
      },
      {}
    );
  }),
  useAssumeProjectPrivileges: demoMutation((_dto, state) =>
    done(state, { message: "Privilege assumption started" })
  ),
  useMembershipPermissionAudit: demoQuery(
    "membership-audit",
    (state, projectId: string, membershipId: string) => {
      const membership = membershipsOf(state, "user", projectId).find(
        (entry) => entry.id === membershipId
      );
      if (!membership) return undefined;
      return {
        sources: [
          ...roleSources(state, membership.roles),
          ...groupSources(state, projectId, { userId: membership.userId }),
          ...privilegeSources(
            state.userPrivileges.filter((entry) => entry.projectMembershipId === membershipId)
          )
        ]
      };
    }
  ),
  useIdentityPermissionAudit: demoQuery(
    "identity-audit",
    (state, projectId: string, identityId: string) => {
      const membership = membershipsOf(state, "identity", projectId).find(
        (entry) => entry.identityId === identityId
      );
      if (!membership) return undefined;
      return {
        sources: [
          ...roleSources(state, membership.roles),
          ...groupSources(state, projectId, { identityId }),
          ...privilegeSources(
            state.identityPrivileges.filter(
              (entry) => entry.projectId === projectId && entry.identityId === identityId
            )
          )
        ]
      };
    }
  ),
  useProjectUserPrivileges: demoQuery("user-privileges", (state, projectMembershipId: string) =>
    state.userPrivileges
      .filter((entry) => entry.projectMembershipId === projectMembershipId)
      .map((entry) => ({
        ...entry,
        permissions: entry.permissions ?? [],
        isLinkedToAccessApproval: Boolean(entry.isLinkedToAccessApproval),
        policyApproverUserIds: entry.policyApproverUserIds ?? []
      }))
  ),
  useProjectUserPrivilege: demoQuery("user-privilege", (state, privilegeId: string) => {
    const found = state.userPrivileges.find((entry) => entry.id === privilegeId);
    return found && { ...found, permissions: found.permissions ?? [] };
  }),
  useCreateProjectUserPrivilege: demoMutation((dto, state) => {
    const created = {
      id: newId(),
      projectMembershipId: dto.projectMembershipId,
      slug: dto.slug || `privilege-${newId().slice(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: dto.permissions,
      ...privilegeWindow(dto.type)
    };
    return done(
      { ...state, userPrivileges: [...state.userPrivileges, created] },
      { privilege: created }
    );
  }),
  useUpdateProjectUserPrivilege: demoMutation((dto, state) => {
    const existing = state.userPrivileges.find((entry) => entry.id === dto.privilegeId)!;
    const next = {
      ...existing,
      ...(dto.slug ? { slug: dto.slug } : {}),
      ...(dto.permissions ? { permissions: dto.permissions } : {}),
      ...(dto.type ? privilegeWindow(dto.type) : {}),
      updatedAt: new Date()
    } as typeof existing;
    return done(
      {
        ...state,
        userPrivileges: state.userPrivileges.map((entry) => (entry === existing ? next : entry))
      },
      { privilege: next }
    );
  }),
  useDeleteProjectUserPrivilege: demoMutation((dto, state) => {
    const existing = state.userPrivileges.find((entry) => entry.id === dto.privilegeId)!;
    return done(
      { ...state, userPrivileges: state.userPrivileges.filter((entry) => entry !== existing) },
      { privilege: existing }
    );
  }),
  useRevokeProjectUserPrivilegeRequest: demoMutation((dto, state) =>
    done(
      {
        ...state,
        userPrivileges: state.userPrivileges.filter(
          (entry) => entry.accessApprovalRequestId !== dto.requestId
        )
      },
      {}
    )
  ),
  useIdentityProjectPrivileges: demoQuery("identity-privileges", (state, dto) =>
    state.identityPrivileges.filter(
      (entry) => entry.projectId === dto.projectId && entry.identityId === dto.identityId
    )
  ),
  useIdentityProjectPrivilege: demoQuery("identity-privilege", (state, dto) =>
    state.identityPrivileges.find((entry) => entry.id === dto.privilegeId)
  ),
  useCreateIdentityProjectPrivilege: demoMutation((dto, state) => {
    const created = {
      id: newId(),
      projectId: dto.projectId,
      identityId: dto.identityId,
      slug: dto.slug || `privilege-${newId().slice(0, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: dto.permissions,
      ...privilegeWindow(dto.type)
    };
    return done({ ...state, identityPrivileges: [...state.identityPrivileges, created] }, created);
  }),
  useUpdateIdentityProjectPrivilege: demoMutation((dto, state) => {
    const existing = state.identityPrivileges.find((entry) => entry.id === dto.privilegeId)!;
    const next = {
      ...existing,
      ...(dto.slug ? { slug: dto.slug } : {}),
      ...(dto.permissions ? { permissions: dto.permissions } : {}),
      ...(dto.type ? privilegeWindow(dto.type) : {}),
      updatedAt: new Date()
    } as typeof existing;
    return done(
      {
        ...state,
        identityPrivileges: state.identityPrivileges.map((entry) =>
          entry === existing ? next : entry
        )
      },
      next
    );
  }),
  useDeleteIdentityProjectPrivilege: demoMutation((dto, state) => {
    const existing = state.identityPrivileges.find((entry) => entry.id === dto.privilegeId)!;
    return done(
      {
        ...state,
        identityPrivileges: state.identityPrivileges.filter((entry) => entry !== existing)
      },
      existing
    );
  }),

  useProjectIdentities: demoQuery(
    "project-identities",
    (state, { projectId, offset, limit, orderDirection, search, roles }) => {
      const matches = membershipsOf(state, "identity", projectId)
        .map((entry) => identityProjectMembership(state, entry))
        .filter((entry) => contains(entry.identity.name, search))
        .filter(
          (entry) =>
            !roles?.length ||
            entry.roles.some((role) => roles.includes(role.customRoleSlug || role.role))
        )
        .sort((a, b) => a.identity.name.localeCompare(b.identity.name) * direction(orderDirection))
        .map(({ project: _project, ...entry }) => entry);
      return { identityMemberships: page(matches, offset, limit), totalCount: matches.length };
    }
  ),
  useProjectIdentity: demoQuery(
    "project-identity",
    (state, projectId: string, identityId: string) => {
      const membership = membershipsOf(state, "identity", projectId).find(
        (entry) => entry.identityId === identityId
      );
      return membership && identityProjectMembership(state, membership);
    }
  ),
  useAddProjectIdentity: demoMutation((dto, state) => {
    const membership: DemoProjectMembership = {
      kind: "identity",
      id: newId(),
      projectId: dto.projectId,
      identityId: dto.identityId,
      roles: [{ id: newId(), role: dto.role ?? "member", isTemporary: false }],
      createdAt: stamp()
    };
    return done(
      { ...state, projectMemberships: [...state.projectMemberships, membership] },
      {
        id: membership.id,
        projectId: dto.projectId,
        identityId: dto.identityId,
        createdAt: membership.createdAt,
        updatedAt: membership.createdAt
      }
    );
  }),
  useUpdateProjectIdentityRoles: demoMutation((dto, state) => {
    const membership = membershipsOf(state, "identity", dto.projectId).find(
      (entry) => entry.identityId === dto.identityId
    )!;
    return done(
      {
        ...state,
        projectMemberships: state.projectMemberships.map((entry) =>
          entry.id === membership.id ? { ...entry, roles: toGrants(dto.roles) } : entry
        )
      },
      {
        id: membership.id,
        projectId: dto.projectId,
        identityId: dto.identityId,
        createdAt: membership.createdAt,
        updatedAt: stamp()
      }
    );
  }),
  useRemoveProjectIdentity: demoMutation((dto, state) => {
    const membership = membershipsOf(state, "identity", dto.projectId).find(
      (entry) => entry.identityId === dto.identityId
    )!;
    return done(
      {
        ...state,
        projectMemberships: state.projectMemberships.filter((entry) => entry.id !== membership.id)
      },
      {
        id: membership.id,
        projectId: dto.projectId,
        identityId: dto.identityId,
        createdAt: membership.createdAt,
        updatedAt: stamp()
      }
    );
  }),
  useCreateProjectManagedIdentity: demoMutation((dto, state) => {
    const identity = {
      id: newId(),
      name: dto.name,
      hasDeleteProtection: dto.hasDeleteProtection ?? false,
      authMethods: [],
      activeLockoutAuthMethods: [],
      createdAt: stamp(),
      updatedAt: stamp(),
      orgId: V4_DEMO_ORG_ID,
      projectId: dto.projectId,
      metadata: (dto.metadata ?? []).map((item) => ({ ...item, id: newId() }))
    };
    return done(
      {
        ...state,
        identities: [...state.identities, identity],
        projectMemberships: [
          ...state.projectMemberships,
          {
            kind: "identity",
            id: newId(),
            projectId: dto.projectId,
            identityId: identity.id,
            roles: (dto.roles ?? [{ role: "member" }]).map((entry) => ({
              id: newId(),
              role: entry.role,
              isTemporary: false
            })),
            createdAt: identity.createdAt
          }
        ]
      },
      identity
    );
  }),
  useDeleteProjectManagedIdentity: demoMutation((dto, state) => {
    const removed = identityOf(state, dto.identityId)!;
    return done(
      {
        ...state,
        identities: state.identities.filter((entry) => entry.id !== dto.identityId),
        projectMemberships: state.projectMemberships.filter(
          (entry) => entry.kind !== "identity" || entry.identityId !== dto.identityId
        )
      },
      toTIdentity(removed)
    );
  }),
  useUpdateProjectManagedIdentity: demoMutation((dto, state) => {
    const current = identityOf(state, dto.identityId)!;
    const next = {
      ...current,
      name: dto.name ?? current.name,
      hasDeleteProtection: dto.hasDeleteProtection ?? current.hasDeleteProtection,
      metadata: dto.metadata
        ? dto.metadata.map((item) => ({ ...item, id: newId() }))
        : current.metadata,
      updatedAt: stamp()
    };
    return done(
      {
        ...state,
        identities: state.identities.map((entry) => (entry.id === next.id ? next : entry))
      },
      toTIdentity(next)
    );
  }),

  useProjectGroups: demoQuery("project-groups", (state, projectId: string) =>
    membershipsOf(state, "group", projectId).map((entry) => groupMembership(state, entry))
  ),
  useProjectGroup: demoQuery("project-group", (state, projectId: string, groupId: string) => {
    const membership = membershipsOf(state, "group", projectId).find(
      (entry) => entry.groupId === groupId
    );
    return membership && groupMembership(state, membership);
  }),
  useAddProjectGroup: demoMutation((dto, state) => {
    const membership: Extract<DemoProjectMembership, { kind: "group" }> = {
      kind: "group",
      id: newId(),
      projectId: dto.projectId,
      groupId: dto.groupId,
      roles: [{ id: newId(), role: dto.role ?? "member", isTemporary: false }],
      createdAt: stamp()
    };
    const next = { ...state, projectMemberships: [...state.projectMemberships, membership] };
    return done(next, groupMembership(next, membership));
  }),
  useUpdateProjectGroupRoles: demoMutation((dto, state) => {
    const roles = toGrants(dto.roles);
    const next = {
      ...state,
      projectMemberships: state.projectMemberships.map((entry) =>
        entry.kind === "group" && entry.projectId === dto.projectId && entry.groupId === dto.groupId
          ? { ...entry, roles }
          : entry
      )
    };
    return done(next, { roles: roles.map((grant) => workspaceRole(next, grant)) });
  }),
  useRemoveProjectGroup: demoMutation((dto, state) => {
    const membership = membershipsOf(state, "group", dto.projectId).find(
      (entry) => entry.groupId === dto.groupId
    )!;
    return done(
      {
        ...state,
        projectMemberships: state.projectMemberships.filter((entry) => entry.id !== membership.id)
      },
      groupMembership(state, membership)
    );
  }),

  useServiceTokens: demoQuery("service-tokens", (state, { workspaceID }) =>
    state.serviceTokens.filter((token) => token.projectId === workspaceID)
  ),
  useCreateServiceToken: demoMutation((dto, state) => {
    const serviceTokenData = {
      id: newId(),
      name: dto.name,
      projectId: dto.workspaceId,
      scopes: dto.scopes,
      user: DEMO_SELF_USER_ID,
      expiresAt: (dto.expiresIn
        ? new Date(Date.now() + dto.expiresIn * 1000).toISOString()
        : null) as string,
      createdAt: stamp(),
      updatedAt: stamp(),
      __v: 0
    };
    return done(
      { ...state, serviceTokens: [...state.serviceTokens, serviceTokenData] },
      { serviceToken: `st.${serviceTokenData.id}.${dto.randomBytes}`, serviceTokenData }
    );
  }),
  useDeleteServiceToken: demoMutation((serviceTokenId: string, state) => {
    const serviceTokenData = state.serviceTokens.find((token) => token.id === serviceTokenId)!;
    return done(
      {
        ...state,
        serviceTokens: state.serviceTokens.filter((token) => token.id !== serviceTokenId)
      },
      { serviceTokenData }
    );
  }),

  useProjectRoles: demoQuery("project-roles", (state, projectId: string) =>
    projectRolesFor(state, projectId).map(({ permissions: _permissions, ...role }) => role)
  ),
  useProjectRole: demoQuery("project-role", (state, projectId: string, roleSlug: string) =>
    projectRolesFor(state, projectId).find((role) => role.slug === roleSlug)
  ),
  useCreateProjectRole: demoMutation(({ projectId, projectType: _type, ...dto }, state) => {
    const role = { ...dto, id: newId(), projectId, createdAt: stamp(), updatedAt: stamp() };
    return done({ ...state, projectRoles: [...state.projectRoles, role] }, role);
  }),
  useUpdateProjectRole: demoMutation(
    ({ id, projectId: _projectId, projectType: _type, ...patch }, state) => {
      const current = state.projectRoles.find((role) => role.id === id)!;
      const next = { ...current, ...patch, updatedAt: stamp() };
      return done(
        {
          ...state,
          projectRoles: state.projectRoles.map((role) => (role.id === id ? next : role))
        },
        next
      );
    }
  ),
  useDeleteProjectRole: demoMutation(({ id }, state) => {
    const removed = state.projectRoles.find((role) => role.id === id)!;
    return done(
      { ...state, projectRoles: state.projectRoles.filter((role) => role.id !== id) },
      removed
    );
  }),
  useProjectEnvironmentFolders: demoQuery("environment-folders", (state, projectId: string) =>
    environmentFolders(state, projectId)
  ),
  useProjectTags: (projectId: string) => {
    const scenario = useAccessScenario();
    if (scenario === "loading") return { data: undefined, isPending: true, error: null };
    return {
      data: DEMO_PROJECT_TAGS.map((tag) => ({ ...tag, projectId })),
      isPending: false,
      error: null
    };
  },
  useAvailableAppConnections: (_app, projectId) => {
    const scenario = useAccessScenario();
    if (scenario === "loading") return { data: undefined, isPending: true, error: null };
    return {
      data: DEMO_VAULT_CONNECTIONS.map((connection) => ({ ...connection, projectId })),
      isPending: false,
      error: null
    };
  },
  useVaultNamespaces: (connectionId) => ({
    data: connectionId
      ? Object.keys(DEMO_VAULT_NAMESPACES).map((name) => ({ id: name, name }))
      : undefined,
    isPending: false,
    error: null
  }),
  useVaultPolicies: (enabled, namespace, connectionId) => ({
    data:
      enabled !== false && connectionId && namespace
        ? DEMO_VAULT_NAMESPACES[namespace]?.policies
        : undefined,
    isPending: false,
    error: null
  }),
  useVaultMounts: (enabled, namespace, connectionId) => ({
    data:
      enabled !== false && connectionId && namespace
        ? DEMO_VAULT_NAMESPACES[namespace]?.mounts
        : undefined,
    isPending: false,
    error: null
  })
};
