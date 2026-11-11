import { ForbiddenError, MongoAbility, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";

import { AccessScope, ActionProjectType, ProjectMembershipRole, ProjectType, ResourceType } from "@app/db/schemas";
import { agentVaultResourceRoles } from "@app/domains/agent-vault/agent-vault/ce/module";
import { applicationRoles } from "@app/domains/certificates/cert-manager/ce/module";
import { signerRoles } from "@app/domains/certificates/code-signing/ce/module";
import type { TActorContext, TActorContexts } from "@app/domains/lib/actor-context";
import { pamResourceRoles } from "@app/domains/pam/pam/ce/module";
import type { ActorGrants, TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import type { TOrganizationsDomain } from "@app/domains/platform/organizations/ce/module";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import type { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
import { ActorAuthMethod, ActorType } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPermissionServiceFactory } from "./permission-service-types";

export type TPermissionAdapterDeps = {
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  actorContexts: Pick<TActorContexts, "forPrincipal">;
  accessControlDomain: Pick<TAccessControlDomain, "fetchGrants">;
  organizationsDomain: Pick<
    TOrganizationsDomain,
    "getOrgPermission" | "getOrgPermissionByRoles" | "getGrantPermissions"
  >;
  projectsDomain: Pick<
    TProjectsDomain,
    | "getProjectPermission"
    | "getProjectResourcePermission"
    | "getProjectPermissionByRoles"
    | "getGrantPermissions"
    | "getPermissionAuditSources"
  >;
  secretsDomain: Pick<
    TSecretsDomain,
    | "getSecretsPermission"
    | "getProjectMemberPermissions"
    | "getFolderGrantAuditSources"
    | "getFolderGrantPermissions"
    | "invalidateFolderGrants"
    | "getPermissionFingerprint"
  >;
  // The original engine, run beside every call in tests to compare. Production passes none.
  shadow?: TPermissionServiceFactory;
};

// CASL decides by the last matching rule, so swapping two neighbouring rules of the same polarity never changes an
// answer, while moving a rule across one of the other polarity can. This keeps the runs of allow and deny rules in
// order and compares each run as a set.
export const decisionShape = (rules: object[]) => {
  const runs: { inverted: boolean; rules: string[] }[] = [];
  for (const { inverted = false, ...rule } of rules as { inverted?: boolean }[]) {
    const last = runs[runs.length - 1];
    const entry = JSON.stringify(rule);
    if (last && last.inverted === inverted) last.rules.push(entry);
    else runs.push({ inverted, rules: [entry] });
  }
  return runs.map((run) => ({ ...run, rules: run.rules.sort() }));
};

const legacyMemberships = (grants: ActorGrants, org?: TActorContext["org"]) =>
  grants.memberships.map((membership) => {
    const { roles, ...row } = membership.toJSON();
    return {
      ...row,
      shouldUseNewPrivilegeSystem: org?.shouldUseNewPrivilegeSystem,
      roles: roles.map(({ customRolePermissions, ...role }) => ({ ...role, permissions: customRolePermissions })),
      additionalPrivileges: grants.privileges.map((privilege) => privilege.toJSON()),
      metadata: grants.attributes.map((attribute) => attribute.toJSON())
    };
  });

const toAbility = (permission: { toAbility: () => unknown }) => permission.toAbility() as MongoAbility;

// The legacy permissionService served through the domains' permission functions, so callers that have not moved
// keep their signatures while one engine decides. Callers move onto the owners' functions directly and this goes.
export const permissionServiceFactory = (deps: TPermissionAdapterDeps): TPermissionServiceFactory => {
  const { userDAL, identityDAL, actorContexts, organizationsDomain, projectsDomain, secretsDomain, shadow } = deps;

  const userOf = (id: string) => requestMemoize(requestMemoKeys.userFindById(id), () => userDAL.findById(id));
  const identityOf = (id: string) =>
    requestMemoize(requestMemoKeys.identityFindById(id), () => identityDAL.findById(id));
  const nameOf = async (type: ActorType, id: string) =>
    type === ActorType.USER ? ((await userOf(id))?.username ?? "") : ((await identityOf(id))?.name ?? "");

  // The principal legacy callers name with flat fields, filled in from the request the way the auth middleware fills
  // req.permission: OAuth scopes, an assumed privilege and the identity's auth info.
  const principalOf = async (
    type: ActorType,
    id: string,
    authMethod: ActorAuthMethod
  ): Promise<TPrincipal | undefined> => {
    if (type === ActorType.USER) {
      const user = await userOf(id);
      const oauthScopes = requestContext.get(RequestContextKey.OauthScopes);
      const assumed = requestContext.get(RequestContextKey.AssumedPrivilegeDetails);
      const assumedType = assumed?.actorType as ActorType.USER | ActorType.IDENTITY | undefined;
      return {
        type: ActorType.USER,
        id,
        username: user?.username ?? "",
        email: user?.email ?? null,
        authMethod: authMethod ?? null,
        isSuperAdmin: Boolean(user?.superAdmin),
        oauth: oauthScopes ? { clientId: "", scopes: oauthScopes } : undefined,
        assumed:
          assumed && assumedType && assumed.requesterId === id
            ? {
                projectId: assumed.projectId,
                actorType: assumedType,
                actorId: assumed.actorId,
                actorName: await nameOf(assumedType, assumed.actorId)
              }
            : undefined
      };
    }
    if (type === ActorType.IDENTITY) {
      const identity = await identityOf(id);
      const authInfo = requestContext.get(RequestContextKey.IdentityAuthInfo);
      return {
        type: ActorType.IDENTITY,
        id,
        name: identity?.name ?? "",
        isInstanceAdmin: false,
        authInfo: authInfo?.identityId === id ? (authInfo as Record<string, unknown>) : undefined
      };
    }
    if (type === ActorType.SERVICE) return undefined;
    return undefined;
  };

  // One context per actor and org for the whole request, so the domains' per-request memo applies across calls.
  const contextOf = async (
    type: ActorType,
    id: string,
    authMethod: ActorAuthMethod,
    orgId: string,
    serviceTokenProjectId?: string
  ): Promise<TActorContext> =>
    requestMemoize(`permission-adapter-context:${type}:${id}:${authMethod ?? ""}:${orgId}`, async () => {
      const principal =
        type === ActorType.SERVICE
          ? ({ type: ActorType.SERVICE, id, projectId: serviceTokenProjectId ?? "" } as TPrincipal)
          : await principalOf(type, id, authMethod);
      if (!principal) throw new BadRequestError({ message: "Invalid actor provided", name: "Get permission" });
      return actorContexts.forPrincipal(principal, orgId);
    });

  // Runs the old engine beside the new one in tests and refuses any difference in what they allow. The mismatch is
  // logged with its call site, since the error handler answers it with a bare 500.
  const compare = async <T extends { permission: MongoAbility }>(
    name: string,
    current: () => Promise<T>,
    legacy?: () => Promise<{ permission: MongoAbility }>
  ): Promise<T> => {
    if (!legacy) return current();
    const callSite = new Error().stack;
    const mismatch = (detail: string) => {
      const message = `Permission shadow mismatch in ${name}: ${detail}`;
      logger.error({ callSite }, message);
      return new Error(message);
    };
    const [currentResult, legacyResult] = await Promise.allSettled([current(), legacy()]);
    if (currentResult.status === "rejected") {
      if (legacyResult.status === "fulfilled") {
        throw mismatch(`only the domains refused (${String(currentResult.reason)})`);
      }
      throw currentResult.reason;
    }
    if (legacyResult.status === "rejected") {
      throw mismatch(`only the legacy engine refused (${String(legacyResult.reason)})`);
    }
    const currentShape = JSON.stringify(decisionShape(currentResult.value.permission.rules));
    const legacyShape = JSON.stringify(decisionShape(legacyResult.value.permission.rules));
    if (currentShape !== legacyShape) throw mismatch(`domains=${currentShape} legacy=${legacyShape}`);
    return currentResult.value;
  };

  const getOrgPermission: TPermissionServiceFactory["getOrgPermission"] = (arg) =>
    compare(
      "getOrgPermission",
      async () => {
        const { actor, actorId, orgId, actorAuthMethod, actorOrgId, scope } = arg;
        if (actor !== ActorType.USER && actor !== ActorType.IDENTITY) {
          throw new BadRequestError({ message: "Invalid actor provided", name: "Get org permission" });
        }
        const context = await contextOf(actor, actorId, actorAuthMethod, actorOrgId);
        const permission = await organizationsDomain.getOrgPermission({ actor: context, orgId, scope });
        return {
          permission: toAbility(permission) as never,
          memberships: legacyMemberships(permission.grants, context.org) as never,
          hasRole: (role: string) => permission.hasRole({ slug: role })
        };
      },
      shadow && (() => shadow.getOrgPermission(arg))
    );

  const getProjectPermission: TPermissionServiceFactory["getProjectPermission"] = (arg) =>
    compare(
      "getProjectPermission",
      async () => {
        const { actor, actorId, projectId, actorAuthMethod, actorOrgId, actionProjectType } = arg;
        if (!actorOrgId) {
          throw new BadRequestError({ message: "Organization context is required for project permission checks" });
        }
        if (actor === ActorType.SERVICE) {
          const context = await contextOf(actor, actorId, actorAuthMethod, actorOrgId, projectId);
          if (actionProjectType !== ActionProjectType.Any && actionProjectType !== ActionProjectType.SecretManager) {
            throw new BadRequestError({
              message: `The project is of type ${ProjectType.SecretManager}. Operations of type ${actionProjectType} are not allowed.`
            });
          }
          const { permission } = await secretsDomain.getSecretsPermission({ actor: context, projectId });
          return {
            permission: toAbility(permission) as never,
            memberships: [],
            hasRole: () => false,
            hasProjectEnforcement: (name: "enforceEncryptedSecretManagerSecretMetadata") =>
              permission.hasProjectEnforcement({ name }),
            folderScopedPrivileges: []
          };
        }
        if (actor !== ActorType.USER && actor !== ActorType.IDENTITY) {
          throw new BadRequestError({ message: "Invalid actor provided", name: "Get org permission" });
        }
        const context = await contextOf(actor, actorId, actorAuthMethod, actorOrgId);
        const { permission, folderGrants } =
          actionProjectType === ActionProjectType.SecretManager
            ? await secretsDomain.getSecretsPermission({ actor: context, projectId })
            : {
                permission: await projectsDomain.getProjectPermission({
                  actor: context,
                  projectId,
                  type:
                    actionProjectType === ActionProjectType.Any
                      ? undefined
                      : (actionProjectType as unknown as ProjectType)
                }),
                folderGrants: []
              };
        return {
          permission: toAbility(permission) as never,
          memberships: legacyMemberships(permission.grants, context.org) as never,
          hasRole: (role: string) => permission.hasRole({ slug: role }),
          hasProjectEnforcement: (name: "enforceEncryptedSecretManagerSecretMetadata") =>
            permission.hasProjectEnforcement({ name }),
          folderScopedPrivileges: folderGrants
        };
      },
      shadow && (() => shadow.getProjectPermission(arg))
    );

  const resourceRolesOf = (resourceType: ResourceType) => {
    if (resourceType === ResourceType.PamFolder || resourceType === ResourceType.PamAccount) {
      return { type: ProjectType.PAM, roles: pamResourceRoles };
    }
    if (resourceType === ResourceType.AgentVaultAccessBundle) {
      return { type: ProjectType.AgentVault, roles: agentVaultResourceRoles };
    }
    if (resourceType === ResourceType.Signer) return { type: ProjectType.CertificateManager, roles: signerRoles };
    return { type: ProjectType.CertificateManager, roles: applicationRoles };
  };

  const getResourcePermission: TPermissionServiceFactory["getResourcePermission"] = (arg) =>
    compare(
      "getResourcePermission",
      async () => {
        const { actor, actorId, projectId, resourceType, resourceId, actorAuthMethod, actorOrgId } = arg;
        if (actor !== ActorType.USER && actor !== ActorType.IDENTITY) {
          throw new BadRequestError({ message: "Invalid actor provided", name: "Get resource permission" });
        }
        if (!actorOrgId) {
          throw new BadRequestError({ message: "Organization context is required for resource permission checks" });
        }
        const context = await contextOf(actor, actorId, actorAuthMethod, actorOrgId);
        const { type, roles } = resourceRolesOf(resourceType);
        const permission = await projectsDomain.getProjectResourcePermission({
          actor: context,
          projectId,
          type,
          resources: [{ resourceType, resourceId }],
          roles: roles as never
        });
        return {
          permission: toAbility(permission) as never,
          memberships: legacyMemberships(permission.grants).map(
            ({ additionalPrivileges: _privileges, metadata: _metadata, ...membership }) => membership
          ) as never,
          hasRole: (role: string) => permission.hasRole({ slug: role }),
          isImplicitAdmin: permission.isImplicitAdmin
        };
      },
      shadow && (() => shadow.getResourcePermission(arg))
    );

  const getProjectPermissions: TPermissionServiceFactory["getProjectPermissions"] = async (projectId, orgId) => {
    const members = await secretsDomain.getProjectMemberPermissions({ orgId, projectId });
    const sourcesOf = (entry: (typeof members.userPermissions)[number]) => () =>
      entry.accessSources().map(({ key, permission }) => ({ key, permission: toAbility(permission) }));
    return {
      userPermissions: members.userPermissions.map((entry) => ({
        ...entry,
        permission: toAbility(entry.permission),
        accessSources: sourcesOf(entry)
      })),
      identityPermissions: members.identityPermissions.map((entry) => ({
        ...entry,
        permission: toAbility(entry.permission),
        accessSources: sourcesOf(entry)
      })),
      groupPermissions: members.groupPermissions.map((entry) => ({
        ...entry,
        permission: toAbility(entry.permission)
      })),
      folderAccessByActorId: members.folderAccessByActorId,
      permissionForActor: (input: Parameters<typeof members.permissionForActor>[0]) =>
        toAbility(members.permissionForActor(input)),
      groupRulesHavePlaceholders: members.groupRulesHavePlaceholders
    } as never;
  };

  const getOrgPermissionByRoles: TPermissionServiceFactory["getOrgPermissionByRoles"] = async (roles, orgId, opts) =>
    (
      await organizationsDomain.getOrgPermissionByRoles({
        orgId,
        roles,
        ignoreUnresolvedRoles: opts?.ignoreUnresolvedRoles
      })
    ).map(({ permission, role }) => ({ permission: toAbility(permission), role })) as never;

  const getProjectPermissionByRoles: TPermissionServiceFactory["getProjectPermissionByRoles"] = async (
    roles,
    projectId,
    opts
  ) =>
    (
      await projectsDomain.getProjectPermissionByRoles({
        projectId,
        roles,
        ignoreUnresolvedRoles: opts?.ignoreUnresolvedRoles
      })
    ).map(({ permission, role }) => ({ permission: toAbility(permission), role })) as never;

  const getActorGrantAbilities: TPermissionServiceFactory["getActorGrantAbilities"] = async ({
    scopeData,
    actorId,
    actorType
  }) => {
    const actor = { type: actorType, id: actorId, name: await nameOf(actorType, actorId) };
    if (scopeData.scope !== AccessScope.Project) {
      const permissions = await organizationsDomain.getGrantPermissions({ actor, orgId: scopeData.orgId });
      return permissions.map((permission) => ({ permission: toAbility(permission) }));
    }
    const [roleGrants, grants] = await Promise.all([
      projectsDomain.getGrantPermissions({ actor, orgId: scopeData.orgId, projectId: scopeData.projectId }),
      deps.accessControlDomain.fetchGrants({
        actor: { type: actorType, id: actorId },
        scope: { scope: AccessScope.Project, orgId: scopeData.orgId, projectId: scopeData.projectId }
      })
    ]);
    const folderGrants = await secretsDomain.getFolderGrantPermissions({
      target: { type: actorType, id: actorId },
      projectId: scopeData.projectId,
      grants
    });
    return [...roleGrants, ...folderGrants].map((permission) => ({ permission: toAbility(permission) }));
  };

  const permissionAudit = async ({
    target,
    projectId,
    actorOrgId,
    includeFolderPermissions
  }: {
    target: { type: ActorType.USER | ActorType.IDENTITY; id: string };
    projectId: string;
    actorOrgId: string;
    includeFolderPermissions: boolean;
  }) => {
    const { sources, grants } = await projectsDomain.getPermissionAuditSources({
      target,
      orgId: actorOrgId,
      projectId
    });
    const folderSources =
      includeFolderPermissions && !grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin)
        ? await secretsDomain.getFolderGrantAuditSources({ target, projectId, grants })
        : [];
    return { sources: [...sources, ...folderSources] };
  };

  const getMembershipPermissionAudit: TPermissionServiceFactory["getMembershipPermissionAudit"] = async (arg) => {
    const { permission } = await getProjectPermission({
      actor: arg.actor,
      actorId: arg.actorId,
      projectId: arg.projectId,
      actorAuthMethod: arg.actorAuthMethod,
      actorOrgId: arg.actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
    return permissionAudit({
      target: { type: ActorType.USER, id: arg.targetUserId },
      projectId: arg.projectId,
      actorOrgId: arg.actorOrgId,
      includeFolderPermissions: arg.includeFolderPermissions
    });
  };

  const getIdentityPermissionAudit: TPermissionServiceFactory["getIdentityPermissionAudit"] = async (arg) => {
    const { permission } = await getProjectPermission({
      actor: arg.actor,
      actorId: arg.actorId,
      projectId: arg.projectId,
      actorAuthMethod: arg.actorAuthMethod,
      actorOrgId: arg.actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: arg.targetIdentityId })
    );
    return permissionAudit({
      target: { type: ActorType.IDENTITY, id: arg.targetIdentityId },
      projectId: arg.projectId,
      actorOrgId: arg.actorOrgId,
      includeFolderPermissions: arg.includeFolderPermissions
    });
  };

  return {
    getOrgPermission,
    getProjectPermission,
    getResourcePermission,
    getProjectPermissions,
    getOrgPermissionByRoles,
    getProjectPermissionByRoles,
    getActorGrantAbilities,
    getMembershipPermissionAudit,
    getIdentityPermissionAudit,
    invalidateProjectFolderPermissionCache: (projectId, tx) =>
      secretsDomain.invalidateFolderGrants({ projectIds: Array.isArray(projectId) ? projectId : [projectId], tx }),
    getProjectPermissionFingerprint: ({ projectId, orgId, actorId, actorType }) =>
      secretsDomain.getPermissionFingerprint({ actor: { type: actorType, id: actorId }, orgId, projectId })
  };
};
