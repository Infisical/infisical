import { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  TableName
} from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { randomId, setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { PAST, TSeedRole } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import {
  OrganizationsModule,
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/domains/platform/organizations/ce/module";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { inMemoryKeyStore } from "@app/keystore/memory";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TIdentityPrincipal, TPrincipal, TUserPrincipal } from "@app/lib/auth/principal";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { toHttpError } from "@app/server/lib/domain-errors";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "../../models/project-permission-set";
import { TProjectRoles } from "../../models/standard-project-roles";
import { ProjectsModule } from "../../module";

// The legacy service reads the OAuth scopes, the assumed privilege and the identity's auth info from the request
// context; the domain services read them from the principal. `legacyRequestContext` sets the first from the second.
const requestStore = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));
vi.mock("@fastify/request-context", () => ({
  requestContext: {
    get: (key: string) => requestStore.values[key],
    set: (key: string, value: unknown) => {
      requestStore.values[key] = value;
    },
    getStore: () => requestStore.values
  }
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

type TRule = RawRuleOf<MongoAbility<ProjectPermissionSet>>;

// CASL decides by the last matching rule, so swapping two neighbouring rules of the same polarity, or repeating one,
// never changes an answer, while moving a rule across one of the other polarity can. This keeps the runs of allow
// and deny rules in order and compares each run as a set, so it fails on any difference that could change a
// decision. (Legacy repeats an actor's privileges once per membership it holds, which this ignores.)
const decisionShape = (rules: object[]) => {
  const runs: { inverted: boolean; rules: string[] }[] = [];
  for (const { inverted = false, ...rule } of rules as { inverted?: boolean }[]) {
    const last = runs[runs.length - 1];
    const entry = JSON.stringify(rule);
    if (last && last.inverted === inverted) last.rules.push(entry);
    else runs.push({ inverted, rules: [entry] });
  }
  return runs.map((run) => ({ ...run, rules: [...new Set(run.rules)].sort() }));
};

// Several permissions checked one at a time (a role set boundary): their order carries no meaning.
const asSet = (permissions: { rules: object[] }[]) =>
  permissions.map((permission) => JSON.stringify(decisionShape(permission.rules))).sort();

const legacyRequestContext = (principal: TPrincipal) => {
  requestStore.values = {};
  if (principal.type === ActorType.USER && principal.oauth?.scopes) {
    requestStore.values[RequestContextKey.OauthScopes] = principal.oauth.scopes;
  }
  if ((principal.type === ActorType.USER || principal.type === ActorType.IDENTITY) && principal.assumed) {
    requestStore.values[RequestContextKey.AssumedPrivilegeDetails] = {
      requesterId: principal.id,
      projectId: principal.assumed.projectId,
      actorType: principal.assumed.actorType,
      actorId: principal.assumed.actorId
    };
  }
  if (principal.type === ActorType.IDENTITY && principal.authInfo) {
    requestStore.values[RequestContextKey.IdentityAuthInfo] = { identityId: principal.id, ...principal.authInfo };
  }
};

type TModules = { organizations: OrganizationsModule; projects: ProjectsModule };

// What the domain code answers for a project check. The generic path is Projects' own; a product passes its service
// (Secrets' getSecretsPermission, PAM's, Agent Vault's) and the roles it hands Projects.
type TCurrentProjectPermission = (input: {
  modules: TModules;
  actor: TActorContext;
  projectId: string;
  type: ProjectType;
}) => Promise<{ rules: object[]; hasRole(input: { slug: string }): boolean }>;

const genericProjectPermission: TCurrentProjectPermission = ({ modules, actor, projectId, type }) =>
  modules.projects.projectPermissionService.getProjectPermission({ actor, projectId, type });

// Compares the legacy permissionService with the domain permission services over the same rows. Deleted with the
// legacy service.
describe("Permission parity: legacy permissionService and the domain permission services", () => {
  const h = setupIntegration();

  beforeEach(() => {
    requestStore.values = {};
  });

  const build = ({ projectRoles = [] }: { projectRoles?: TProjectRoles[] } = {}) => {
    const legacy = permissionServiceFactory({
      permissionDAL: permissionDALFactory(h.db),
      serviceTokenDAL: serviceTokenDALFactory(h.db),
      projectDAL: projectDALFactory(h.db),
      userDAL: userDALFactory(h.db),
      identityDAL: identityDALFactory(h.db),
      keyStore: inMemoryKeyStore(),
      roleDAL: roleDALFactory(h.db),
      additionalPrivilegeDAL: additionalPrivilegeDALFactory(h.db),
      groupDAL: groupDALFactory(h.db),
      secretFolderDAL: secretFolderDALFactory(h.db),
      orgDAL: orgDALFactory(h.db)
    });
    const accessControl = accessControlServices(h.db);
    const organizations = new OrganizationsModule({ db: h.db, ...accessControl });
    const projects = new ProjectsModule({
      db: h.db,
      keyStore: new InMemoryKeyStore(),
      ...accessControl,
      orgPermissionService: organizations.orgPermissionService,
      projectRoles,
      cacheMarkerTtlSeconds: 0
    });
    return { legacy, modules: { organizations, projects } };
  };

  const seed = () => new KnexGrantSeeder(h.db);

  const newUserInOrg = async (orgId: string, orgRole: string = OrgMembershipRole.Member) => {
    const user = await h.factories.user();
    await seed().membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId: user.id },
      roles: [{ role: orgRole }]
    });
    return user;
  };

  const newIdentityInOrg = async (orgId: string) => {
    const [identity] = await h
      .db(TableName.Identity)
      .insert({ name: `identity-${randomId()}`, orgId })
      .returning("*");
    await seed().membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { identityId: identity.id },
      roles: [{ role: OrgMembershipRole.Member }]
    });
    return identity;
  };

  const projectRoles = (
    tenant: { org: { id: string }; project: { id: string } },
    actor: { userId: string } | { identityId: string },
    roles: TSeedRole[]
  ) =>
    seed().membership({ scope: AccessScope.Project, orgId: tenant.org.id, projectId: tenant.project.id, actor, roles });

  const customRole = async (owner: { orgId: string } | { projectId: string }, rules: object[]) =>
    seed().role({ owner, slug: `custom-${randomId()}`, permissions: packRules(rules as TRule[]) });

  const userPrincipal = (user: { id: string; username: string }, extra: Partial<TUserPrincipal> = {}): TPrincipal => ({
    type: ActorType.USER,
    id: user.id,
    username: user.username,
    email: null,
    authMethod: AuthMethod.EMAIL,
    isSuperAdmin: false,
    ...extra
  });

  const identityPrincipal = (
    identity: { id: string; name: string },
    extra: Partial<TIdentityPrincipal> = {}
  ): TPrincipal => ({
    type: ActorType.IDENTITY,
    id: identity.id,
    name: identity.name,
    isInstanceAdmin: false,
    ...extra
  });

  const legacyArgs = (principal: TPrincipal, orgId: string) => ({
    actor: principal.type as ActorType.USER,
    actorId: principal.id,
    actorAuthMethod: AuthMethod.EMAIL,
    actorOrgId: orgId
  });

  const BUILT_IN_PROJECT_SLUGS = [
    ProjectMembershipRole.Admin,
    ProjectMembershipRole.Member,
    ProjectMembershipRole.Viewer,
    ProjectMembershipRole.NoAccess,
    ProjectMembershipRole.KmsCryptographicOperator
  ];

  const compareProject = async ({
    principal,
    orgId,
    projectId,
    type,
    current = genericProjectPermission,
    roles,
    extraSlugs = []
  }: {
    principal: TPrincipal;
    orgId: string;
    projectId: string;
    type: ProjectType;
    current?: TCurrentProjectPermission;
    roles?: TProjectRoles[];
    extraSlugs?: string[];
  }) => {
    const { legacy, modules } = build({ projectRoles: roles });
    legacyRequestContext(principal);
    const legacyResult = await legacy.getProjectPermission({
      ...legacyArgs(principal, orgId),
      projectId,
      actionProjectType: type as unknown as ActionProjectType
    });
    const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId });
    const permission = await current({ modules, actor, projectId, type });

    expect(decisionShape(permission.rules)).toEqual(decisionShape(legacyResult.permission.rules));
    const slugs = [...BUILT_IN_PROJECT_SLUGS, ...extraSlugs];
    expect(slugs.map((slug) => permission.hasRole({ slug }))).toEqual(slugs.map((slug) => legacyResult.hasRole(slug)));
    return { legacyResult, permission };
  };

  const compareOrg = async ({
    principal,
    orgId,
    extraSlugs = []
  }: {
    principal: TPrincipal;
    orgId: string;
    extraSlugs?: string[];
  }) => {
    const { legacy, modules } = build();
    legacyRequestContext(principal);
    const legacyResult = await legacy.getOrgPermission({
      ...legacyArgs(principal, orgId),
      orgId,
      scope: OrganizationActionScope.Any
    });
    const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId });
    const permission = await modules.organizations.orgPermissionService.getOrgPermission({ actor });

    expect(decisionShape(permission.rules)).toEqual(decisionShape(legacyResult.permission.rules));
    const slugs = [OrgMembershipRole.Admin, OrgMembershipRole.Member, OrgMembershipRole.NoAccess, ...extraSlugs];
    expect(slugs.map((slug) => permission.hasRole({ slug }))).toEqual(slugs.map((slug) => legacyResult.hasRole(slug)));
  };

  // Both refuse, with the same HTTP error, name and message once the domain error is mapped at the boundary.
  const compareRefusal = async (legacyCall: Promise<unknown>, currentCall: Promise<unknown>) => {
    const [legacyError, currentError] = await Promise.all([
      legacyCall.then(
        () => null,
        (error: Error) => error
      ),
      currentCall.then(
        () => null,
        (error: Error) => error
      )
    ]);
    expect(legacyError).not.toBeNull();
    expect(currentError).not.toBeNull();
    const asHttp = (error: Error) => ({ kind: error.constructor.name, name: error.name, message: error.message });
    expect(asHttp(toHttpError(currentError as Error))).toEqual(asHttp(legacyError as Error));
  };

  describe("org permission", () => {
    test.each([OrgMembershipRole.Admin, OrgMembershipRole.Member, OrgMembershipRole.NoAccess])(
      "should match for a user with the built-in %s org role",
      async (role) => {
        // Setup
        const org = await h.factories.organization();
        const user = await newUserInOrg(org.id, role);

        // Action and assert
        await compareOrg({ principal: userPrincipal(user), orgId: org.id });
      }
    );

    test("should match for a user with a custom org role, a group role and an org privilege", async () => {
      // Setup
      const org = await h.factories.organization();
      const role = await customRole({ orgId: org.id }, [
        { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member },
        { action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Settings, inverted: true }
      ]);
      const user = await h.factories.user();
      await seed().membership({
        scope: AccessScope.Organization,
        orgId: org.id,
        actor: { userId: user.id },
        roles: [{ role: OrgMembershipRole.Custom, customRoleId: role.id }]
      });
      const group = await seed().group({ orgId: org.id });
      await seed().groupMember({ groupId: group.id, userId: user.id });
      await seed().membership({
        scope: AccessScope.Organization,
        orgId: org.id,
        actor: { groupId: group.id },
        roles: [{ role: OrgMembershipRole.Admin }]
      });
      await seed().privilege({
        actor: { userId: user.id },
        orgId: org.id,
        permissions: packRules([{ action: OrgPermissionActions.Delete, subject: OrgPermissionSubjects.Role }])
      });

      // Action and assert
      await compareOrg({ principal: userPrincipal(user), orgId: org.id, extraSlugs: [role.slug] });
    });

    test("should match when a temporary org admin role has ended and an active one remains", async () => {
      // Setup
      const org = await h.factories.organization();
      const user = await h.factories.user();
      await seed().membership({
        scope: AccessScope.Organization,
        orgId: org.id,
        actor: { userId: user.id },
        roles: [
          { role: OrgMembershipRole.Admin, temporaryAccessEndTime: PAST() },
          { role: OrgMembershipRole.Member, temporaryAccessEndTime: new Date(Date.now() + 3_600_000) }
        ]
      });

      // Action and assert
      await compareOrg({ principal: userPrincipal(user), orgId: org.id });
    });

    test("should match for an identity", async () => {
      // Setup
      const org = await h.factories.organization();
      const identity = await newIdentityInOrg(org.id);

      // Action and assert
      await compareOrg({ principal: identityPrincipal(identity), orgId: org.id });
    });

    test("should match for a user in a sub-org", async () => {
      // Setup
      const root = await h.factories.organization();
      const child = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
      const user = await newUserInOrg(root.id);
      await seed().membership({
        scope: AccessScope.Organization,
        orgId: child.id,
        actor: { userId: user.id },
        roles: [{ role: OrgMembershipRole.Admin }]
      });

      // Action and assert
      await compareOrg({ principal: userPrincipal(user), orgId: child.id });
    });

    test("should match for an org admin's delegated OAuth token", async () => {
      // Setup
      const org = await h.factories.organization();
      const user = await newUserInOrg(org.id, OrgMembershipRole.Admin);

      // Action and assert
      await compareOrg({
        principal: userPrincipal(user, { oauth: { clientId: "client", scopes: ["secrets:read"] } }),
        orgId: org.id
      });
    });

    test("should refuse a non-member of the org alike", async () => {
      // Setup
      const org = await h.factories.organization();
      const user = await h.factories.user();
      const principal = userPrincipal(user);
      const { legacy, modules } = build();
      const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId: org.id });

      // Action and assert
      await compareRefusal(
        legacy.getOrgPermission({
          ...legacyArgs(principal, org.id),
          orgId: org.id,
          scope: OrganizationActionScope.Any
        }),
        modules.organizations.orgPermissionService.getOrgPermission({ actor })
      );
    });
  });

  describe("generic project permission", () => {
    test.each([
      ProjectMembershipRole.Admin,
      ProjectMembershipRole.Member,
      ProjectMembershipRole.Viewer,
      ProjectMembershipRole.NoAccess
    ])("should match in a Secret Manager project for a user with the built-in %s role", async (role) => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: user.id }, [{ role }]);

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should match for a custom role whose conditions use the actor's username, held through a group", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      const role = await customRole({ projectId: tenant.project.id }, [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "prod", secretPath: { $glob: "/users/{{identity.username}}/**" } }
        },
        {
          action: ProjectPermissionSecretActions.Edit,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "prod", secretPath: "/users/admin" },
          inverted: true
        }
      ]);
      const group = await seed().group({ orgId: tenant.org.id });
      await seed().groupMember({ groupId: group.id, userId: user.id });
      await seed().membership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { groupId: group.id },
        roles: [{ role: ProjectMembershipRole.Custom, customRoleId: role.id }]
      });
      await projectRoles(tenant, { userId: user.id }, [{ role: ProjectMembershipRole.Viewer }]);

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager,
        extraSlugs: [role.slug]
      });
    });

    test("should match when a temporary admin role has ended and other roles remain", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: user.id }, [
        { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() },
        { role: ProjectMembershipRole.Member, temporaryAccessEndTime: new Date(Date.now() + 3_600_000) },
        { role: ProjectMembershipRole.Viewer }
      ]);

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should match with a project-wide additional privilege and a legacy forbid in a custom role", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      const role = await customRole({ projectId: tenant.project.id }, [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "prod" },
          inverted: true
        }
      ]);
      await projectRoles(tenant, { userId: user.id }, [
        { role: ProjectMembershipRole.Member },
        { role: ProjectMembershipRole.Custom, customRoleId: role.id }
      ]);
      await seed().privilege({
        actor: { userId: user.id },
        projectId: tenant.project.id,
        permissions: packRules<TRule>([
          { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags },
          {
            action: ProjectPermissionSecretActions.Create,
            subject: ProjectPermissionSub.Secrets,
            conditions: { environment: "dev" }
          } as TRule
        ])
      });

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager,
        extraSlugs: [role.slug]
      });
    });

    test("should match for an identity whose custom role reads its metadata and auth info", async () => {
      // Setup
      const tenant = await h.newTenant();
      const identity = await newIdentityInOrg(tenant.org.id);
      await seed().attribute({
        orgId: tenant.org.id,
        actor: { identityId: identity.id },
        key: "team",
        value: "payments"
      });
      const role = await customRole({ projectId: tenant.project.id }, [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: {
            environment: "prod",
            secretPath:
              "/{{identity.metadata.team}}/{{identity.auth.kubernetes.namespace}}/{{identity.metadata.region}}"
          }
        }
      ]);
      await projectRoles(tenant, { identityId: identity.id }, [
        { role: ProjectMembershipRole.Custom, customRoleId: role.id }
      ]);

      // Action and assert
      await compareProject({
        principal: identityPrincipal(identity, {
          authInfo: { identityName: identity.name, authMethod: "kubernetes-auth", kubernetes: { namespace: "billing" } }
        }),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager,
        extraSlugs: [role.slug]
      });
    });

    test("should match for a delegated OAuth token narrowed to secrets:read, roles included", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      const role = await customRole({ projectId: tenant.project.id }, [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "prod" },
          inverted: true
        }
      ]);
      await projectRoles(tenant, { userId: user.id }, [
        { role: ProjectMembershipRole.Admin },
        { role: ProjectMembershipRole.Custom, customRoleId: role.id }
      ]);

      // Action and assert
      await compareProject({
        principal: userPrincipal(user, { oauth: { clientId: "client", scopes: ["secrets:read"] } }),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager,
        extraSlugs: [role.slug]
      });
    });

    test("should match for a user assuming an identity's privileges in the project", async () => {
      // Setup
      const tenant = await h.newTenant();
      const identity = await newIdentityInOrg(tenant.org.id);
      const role = await customRole({ projectId: tenant.project.id }, [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { secretPath: "/{{identity.username}}" }
        }
      ]);
      await projectRoles(tenant, { identityId: identity.id }, [
        { role: ProjectMembershipRole.Custom, customRoleId: role.id }
      ]);

      // Action and assert
      await compareProject({
        principal: userPrincipal(tenant.admin, {
          assumed: {
            projectId: tenant.project.id,
            actorType: ActorType.IDENTITY,
            actorId: identity.id,
            actorName: identity.name
          }
        }),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager,
        extraSlugs: [role.slug]
      });
    });

    test("should match for a user whose assumed privilege is for another project", async () => {
      // Setup
      const tenant = await h.newTenant();
      const identity = await newIdentityInOrg(tenant.org.id);

      // Action and assert
      await compareProject({
        principal: userPrincipal(tenant.admin, {
          assumed: { projectId: crypto.randomUUID(), actorType: ActorType.IDENTITY, actorId: identity.id }
        }),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test.each([
      [ProjectType.KMS, ProjectMembershipRole.Admin],
      [ProjectType.KMS, ProjectMembershipRole.Member],
      [ProjectType.CertificateManager, ProjectMembershipRole.Member],
      [ProjectType.CertificateManager, ProjectMembershipRole.Admin],
      [ProjectType.SecretScanning, ProjectMembershipRole.Viewer]
    ])("should match in a %s project for the %s role, where the generic roles apply", async (type, role) => {
      // Setup
      const tenant = await h.newTenant({ projectType: type });
      const user = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: user.id }, [{ role }]);

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type
      });
    });

    test("should match for a role slug no product defines any more", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: user.id }, [
        { role: "ssh-host-bootstrapper" },
        { role: ProjectMembershipRole.Viewer }
      ]);

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager,
        extraSlugs: ["ssh-host-bootstrapper"]
      });
    });
  });

  describe("project refusals", () => {
    const compareProjectRefusal = async ({
      principal,
      orgId,
      projectId,
      type
    }: {
      principal: TPrincipal;
      orgId: string;
      projectId: string;
      type: ProjectType;
    }) => {
      const { legacy, modules } = build();
      legacyRequestContext(principal);
      const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId });
      await compareRefusal(
        legacy.getProjectPermission({
          ...legacyArgs(principal, orgId),
          projectId,
          actionProjectType: type as unknown as ActionProjectType
        }),
        modules.projects.projectPermissionService.getProjectPermission({ actor, projectId, type })
      );
    };

    test("should refuse an org member who is not in the project alike", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);

      // Action and assert
      await compareProjectRefusal({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should refuse another org's project alike", async () => {
      // Setup
      const tenant = await h.newTenant();
      const other = await h.newTenant();

      // Action and assert
      await compareProjectRefusal({
        principal: userPrincipal(tenant.admin),
        orgId: tenant.org.id,
        projectId: other.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should refuse a check for another product's project type alike", async () => {
      // Setup
      const tenant = await h.newTenant();

      // Action and assert
      await compareProjectRefusal({
        principal: userPrincipal(tenant.admin),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.KMS
      });
    });
  });

  describe("permissions built from roles and grants", () => {
    test("should match by-roles permissions for built-in and custom org and project roles", async () => {
      // Setup
      const tenant = await h.newTenant();
      const orgRole = await customRole({ orgId: tenant.org.id }, [
        { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member }
      ]);
      const projectRole = await customRole({ projectId: tenant.project.id }, [
        { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags }
      ]);
      const { legacy, modules } = build();
      const projectSlugs = [ProjectMembershipRole.Viewer, ProjectMembershipRole.Admin, projectRole.slug];

      // Action
      const [legacyOrg, currentOrg, legacyProject, currentProject] = await Promise.all([
        legacy.getOrgPermissionByRoles([OrgMembershipRole.Member, orgRole.slug], tenant.org.id),
        modules.organizations.orgPermissionService.getOrgPermissionByRoles({
          orgId: tenant.org.id,
          roles: [OrgMembershipRole.Member, orgRole.slug]
        }),
        legacy.getProjectPermissionByRoles(projectSlugs, tenant.project.id),
        modules.projects.projectPermissionService.getProjectPermissionByRoles({
          projectId: tenant.project.id,
          roles: projectSlugs
        })
      ]);

      // Assert
      expect(currentOrg.map(({ permission }) => decisionShape(permission.rules))).toEqual(
        legacyOrg.map(({ permission }) => decisionShape(permission.rules))
      );
      expect(currentOrg.map(({ role }) => role?.id)).toEqual(legacyOrg.map(({ role }) => role?.id));
      expect(currentProject.map(({ permission }) => decisionShape(permission.rules))).toEqual(
        legacyProject.map(({ permission }) => decisionShape(permission.rules))
      );
      expect(currentProject.map(({ role }) => [role.slug, role.name])).toEqual(
        legacyProject.map(({ role }) => [role?.slug, role?.name])
      );
    });

    test("should refuse an unresolved slug alike, and drop it alike when told to", async () => {
      // Setup
      const tenant = await h.newTenant();
      const { legacy, modules } = build();
      const roles = [ProjectMembershipRole.Viewer, "ssh-host-bootstrapper"];

      // Action
      const [legacyKept, currentKept] = await Promise.all([
        legacy.getProjectPermissionByRoles(roles, tenant.project.id, { ignoreUnresolvedRoles: true }),
        modules.projects.projectPermissionService.getProjectPermissionByRoles({
          projectId: tenant.project.id,
          roles,
          ignoreUnresolvedRoles: true
        })
      ]);

      // Assert
      expect(currentKept.map(({ role }) => role.slug)).toEqual(legacyKept.map(({ role }) => role?.slug));
      await compareRefusal(
        legacy.getProjectPermissionByRoles(roles, tenant.project.id),
        modules.projects.projectPermissionService.getProjectPermissionByRoles({ projectId: tenant.project.id, roles })
      );
      await compareRefusal(
        legacy.getOrgPermissionByRoles(["ssh-host-bootstrapper"], tenant.org.id),
        modules.organizations.orgPermissionService.getOrgPermissionByRoles({
          orgId: tenant.org.id,
          roles: ["ssh-host-bootstrapper"]
        })
      );
    });

    test("should match an identity's grant permissions at the project and the org", async () => {
      // Setup
      const tenant = await h.newTenant();
      const identity = await newIdentityInOrg(tenant.org.id);
      await seed().attribute({
        orgId: tenant.org.id,
        actor: { identityId: identity.id },
        key: "team",
        value: "payments"
      });
      const role = await customRole({ projectId: tenant.project.id }, [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { secretPath: "/{{identity.username}}/{{identity.metadata.team}}" }
        },
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { secretPath: "/{{identity.auth.kubernetes.namespace}}" }
        }
      ]);
      await projectRoles(tenant, { identityId: identity.id }, [
        { role: ProjectMembershipRole.Viewer },
        { role: ProjectMembershipRole.Custom, customRoleId: role.id }
      ]);
      await seed().privilege({
        actor: { identityId: identity.id },
        projectId: tenant.project.id,
        permissions: packRules<TRule>([{ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags }])
      });
      const { legacy, modules } = build();
      const actor = { type: ActorType.IDENTITY as const, id: identity.id, name: identity.name };

      // Action
      const legacyProject = await legacy.getActorGrantAbilities({
        scopeData: { scope: AccessScope.Project, orgId: tenant.org.id, projectId: tenant.project.id },
        actorId: identity.id,
        actorType: ActorType.IDENTITY
      });
      const currentProject = await modules.projects.projectPermissionService.getGrantPermissions({
        actor,
        orgId: tenant.org.id,
        projectId: tenant.project.id
      });
      const legacyOrg = await legacy.getActorGrantAbilities({
        scopeData: { scope: AccessScope.Organization, orgId: tenant.org.id },
        actorId: identity.id,
        actorType: ActorType.IDENTITY
      });
      const currentOrg = await modules.organizations.orgPermissionService.getGrantPermissions({
        actor,
        orgId: tenant.org.id
      });

      // Assert
      expect(asSet(currentProject)).toEqual(asSet(legacyProject.map(({ permission }) => permission)));
      expect(asSet(currentOrg)).toEqual(asSet(legacyOrg.map(({ permission }) => permission)));
    });

    test("should match a member's permission audit sources", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      const role = await customRole({ projectId: tenant.project.id }, [
        { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags }
      ]);
      const group = await seed().group({ orgId: tenant.org.id });
      await seed().groupMember({ groupId: group.id, userId: user.id });
      await seed().membership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { groupId: group.id },
        roles: [{ role: ProjectMembershipRole.Member }]
      });
      await projectRoles(tenant, { userId: user.id }, [
        { role: ProjectMembershipRole.Viewer },
        { role: ProjectMembershipRole.Custom, customRoleId: role.id },
        { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() }
      ]);
      await seed().privilege({
        actor: { userId: user.id },
        projectId: tenant.project.id,
        permissions: packRules<TRule>([{ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.Tags }])
      });
      const { legacy, modules } = build();

      // Action
      const legacyAudit = await legacy.getMembershipPermissionAudit({
        actor: ActorType.USER,
        actorId: tenant.admin.id,
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: tenant.org.id,
        projectId: tenant.project.id,
        targetUserId: user.id,
        includeFolderPermissions: false
      });
      const current = await modules.projects.projectPermissionService.getPermissionAuditSources({
        target: { type: ActorType.USER, id: user.id },
        orgId: tenant.org.id,
        projectId: tenant.project.id
      });

      // Assert
      const byId = <T extends { id: string }>(sources: T[]) => [...sources].sort((a, b) => a.id.localeCompare(b.id));
      expect(byId(current.sources)).toEqual(byId(legacyAudit.sources));
    });

    test("should match what a role set boundary sees when a role is held twice or a no-access role is held", async () => {
      // Setup
      const tenant = await h.newTenant();
      const identity = await newIdentityInOrg(tenant.org.id);
      await projectRoles(tenant, { identityId: identity.id }, [
        { role: ProjectMembershipRole.Viewer },
        { role: ProjectMembershipRole.NoAccess }
      ]);
      const group = await seed().group({ orgId: tenant.org.id });
      await seed().groupMember({ groupId: group.id, identityId: identity.id });
      await seed().membership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { groupId: group.id },
        roles: [{ role: ProjectMembershipRole.Viewer }]
      });
      const { legacy, modules } = build();

      // Action
      const legacyProject = await legacy.getActorGrantAbilities({
        scopeData: { scope: AccessScope.Project, orgId: tenant.org.id, projectId: tenant.project.id },
        actorId: identity.id,
        actorType: ActorType.IDENTITY
      });
      const currentProject = await modules.projects.projectPermissionService.getGrantPermissions({
        actor: { type: ActorType.IDENTITY, id: identity.id, name: identity.name },
        orgId: tenant.org.id,
        projectId: tenant.project.id
      });

      // Assert
      // Legacy resolves each distinct slug once and leaves out no-access; the domain returns one permission per held
      // role. assertRoleSetBoundary checks each target on its own and treats no target as an empty one, so a repeated
      // permission or an empty one cannot change its answer: compare the distinct permissions that grant something.
      const boundaryView = (permissions: { rules: object[] }[]) => [
        ...new Set(asSet(permissions.filter((permission) => permission.rules.length > 0)))
      ];
      expect(boundaryView(currentProject)).toEqual(boundaryView(legacyProject.map(({ permission }) => permission)));
    });
  });

  describe("product project permission (ported as each product's service lands)", () => {
    test.todo(
      "Secrets: a Secret Manager project with a folder grant matches getSecretsPermission and its folder grants"
    );
    test.todo(
      "Secrets: by-roles, grant permissions and audit sources with folder grants, and the project member listing"
    );
    test.todo("PAM: a PAM project member and admin, and a custom role resolving to the member rules");
    test.todo("PAM: folder and account resource permission for each PAM resource role and the project admin");
    test.todo("Agent Vault: an Agent Vault project member and admin, and an access bundle consumer");
    test.todo("Cert Manager: a certificate application permission for each application role and the project admin");
    test.todo("Code signing: a signer permission for each signer role and the project admin");
    test.todo("KMS: the cryptographic operator role in a KMS project");
    test.todo("KMS: a project admin holds CMEK PublishPublicKey, through the KMS product service");
    test.todo(
      "PAM and Agent Vault: a project member holding viewer, no-access or an unknown slug resolves to the member rules"
    );
    test.todo("PAM, Agent Vault, Cert Manager and code signing: a delegated OAuth token's hasRole is false");
  });
});
