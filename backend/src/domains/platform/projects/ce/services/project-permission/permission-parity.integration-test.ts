import { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  RESOURCE_SCOPE,
  ResourceMembershipRole,
  ResourceType,
  SecretFolderRole,
  TableName
} from "@app/db/schemas";
// The Agent Vault roles and permission service are EE only; this spec, deleted with the legacy service, compares them.
// oxlint-disable-next-line no-restricted-imports
import {
  AccessBundleRoles,
  AgentVaultEeModule,
  agentVaultProjectMemberPermissions,
  AgentVaultProjectRoles
} from "@app/domains/agent-vault/agent-vault/ee/module";
import { CertManagerModule } from "@app/domains/certificates/cert-manager/ce/module";
import { CodeSigningModule } from "@app/domains/certificates/code-signing/ce/module";
import { KmsModule, kmsProjectRoles } from "@app/domains/kms/kms/ce/module";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { randomId, setupIntegration, TTenant } from "@app/domains/lib/testing/integration";
import { PamModule, pamProjectMemberPermissions, PamProjectRoles } from "@app/domains/pam/pam/ce/module";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import {
  PAST,
  TSeedActor,
  TSeedRole,
  temporaryColumns
} from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { FakeUsageMeteringService } from "@app/domains/platform/license/ce/testing/fake-usage-metering-service";
import {
  OrganizationsModule,
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/domains/platform/organizations/ce/module";
import { SecretsModule } from "@app/domains/secrets-manager/secrets/ce/module";
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
import { membershipDALFactory } from "@app/services/membership/membership-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import { ProjectPermission } from "../../models/project-permission";
import {
  ProjectPermissionActions,
  ProjectPermissionCmekActions,
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

type TFolderGrantView = { id: string; folderId: string; role: string; environmentSlug: string; secretPath: string };

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

type TModules = {
  organizations: OrganizationsModule;
  projects: ProjectsModule;
  secrets: SecretsModule;
  pam: PamModule;
  certManager: CertManagerModule;
  codeSigning: CodeSigningModule;
  kms: KmsModule;
  agentVault: AgentVaultEeModule;
};

// The product roles domains.ts hands Projects.
const productProjectRoles = (): TProjectRoles[] => [
  new PamProjectRoles(),
  new AgentVaultProjectRoles(),
  kmsProjectRoles
];

// What the domain code answers for a project check. The generic path is Projects' own; a product passes its service
// (Secrets' getSecretsPermission, PAM's, Agent Vault's) and the roles it hands Projects.
type TCurrentProjectPermission = (input: {
  modules: TModules;
  actor: TActorContext;
  projectId: string;
  type: ProjectType;
}) => Promise<ProjectPermission>;

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
    const { projectsService, projectPermissionService, projectResourcePermissionService } = projects;
    const modules: TModules = {
      organizations,
      projects,
      secrets: new SecretsModule({
        db: h.db,
        keyStore: new InMemoryKeyStore(),
        projectPermissionService,
        actorGrantsService: accessControl.actorGrantsService,
        groupService: accessControl.groupService,
        projectsService,
        cacheMarkerTtlSeconds: 0
      }),
      pam: new PamModule({ projectsService, projectResourcePermissionService }),
      certManager: new CertManagerModule({
        db: h.db,
        organizationsService: organizations.organizationsService,
        projectResourcePermissionService
      }),
      codeSigning: new CodeSigningModule({ projectResourcePermissionService }),
      kms: new KmsModule({ projectPermissionService }),
      agentVault: new AgentVaultEeModule({
        keyStore: new InMemoryKeyStore(),
        licenseService: new FakeLicenseService(),
        usageMeteringService: new FakeUsageMeteringService(),
        organizationsService: organizations.organizationsService,
        projectPermissionService,
        actorGrantsService: accessControl.actorGrantsService
      })
    };
    return { legacy, modules, membershipDAL: membershipDALFactory(h.db) };
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

  describe("product project permission", () => {
    type TResource = { resourceType: ResourceType; resourceId: string };

    type TCurrentResourcePermission = (input: { modules: TModules; actor: TActorContext }) => Promise<{
      rules: object[];
      hasRole(input: { slug: string }): boolean;
      isImplicitAdmin: boolean;
    }>;

    // Each product's own resource check, as its routes call it. Access bundles have no product service yet.
    const resourcePermission =
      (projectId: string, { resourceType, resourceId }: TResource): TCurrentResourcePermission =>
      ({ modules, actor }) => {
        switch (resourceType) {
          case ResourceType.PamFolder:
            return modules.pam.pamPermissionService.getPamPermission({ actor, projectId, folderId: resourceId });
          case ResourceType.PamAccount:
            return modules.pam.pamPermissionService.getPamPermission({ actor, projectId, accountId: resourceId });
          case ResourceType.CertificateApplication:
            return modules.certManager.applicationPermissionService.getApplicationPermission({
              actor,
              projectId,
              applicationId: resourceId
            });
          case ResourceType.Signer:
            return modules.codeSigning.signerPermissionService.getSignerPermission({
              actor,
              projectId,
              signerId: resourceId
            });
          default:
            return modules.projects.projectResourcePermissionService.getResourcePermission({
              actor,
              projectId,
              type: ProjectType.AgentVault,
              resources: [{ resourceType, resourceId }],
              roles: new AccessBundleRoles()
            });
        }
      };

    const RESOURCE_SLUGS = ["admin", "operator", "connector", "auditor", "consumer", "custom"];

    const resourceRoles = (
      tenant: TTenant,
      { resourceType, resourceId }: TResource,
      actor: TSeedActor | { groupId: string },
      roles: TSeedRole[]
    ) =>
      seed().membership({
        scope: RESOURCE_SCOPE,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        resourceType,
        resourceId,
        actor,
        roles
      });

    const compareResource = async ({
      principal,
      tenant,
      resource,
      current = resourcePermission(tenant.project.id, resource)
    }: {
      principal: TPrincipal;
      tenant: TTenant;
      resource: TResource;
      current?: TCurrentResourcePermission;
    }) => {
      const { legacy, modules } = build({ projectRoles: productProjectRoles() });
      legacyRequestContext(principal);
      const legacyResult = await legacy.getResourcePermission({
        ...legacyArgs(principal, tenant.org.id),
        projectId: tenant.project.id,
        ...resource
      });
      const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId: tenant.org.id });
      const permission = await current({ modules, actor });

      expect(decisionShape(permission.rules)).toEqual(decisionShape(legacyResult.permission.rules));
      expect(RESOURCE_SLUGS.map((slug) => permission.hasRole({ slug }))).toEqual(
        RESOURCE_SLUGS.map((slug) => legacyResult.hasRole(slug))
      );
      expect(permission.isImplicitAdmin).toBe(legacyResult.isImplicitAdmin);
      return { legacyResult, permission };
    };

    const compareResourceRefusal = async ({
      principal,
      tenant,
      resource
    }: {
      principal: TPrincipal;
      tenant: TTenant;
      resource: TResource;
    }) => {
      const { legacy, modules } = build({ projectRoles: productProjectRoles() });
      legacyRequestContext(principal);
      const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId: tenant.org.id });
      await compareRefusal(
        legacy.getResourcePermission({
          ...legacyArgs(principal, tenant.org.id),
          projectId: tenant.project.id,
          ...resource
        }),
        resourcePermission(tenant.project.id, resource)({ modules, actor })
      );
    };

    const newResource = (resourceType: ResourceType): TResource => ({ resourceType, resourceId: crypto.randomUUID() });

    const secretsPermission =
      (onFolderGrants: (grants: TFolderGrantView[]) => void): TCurrentProjectPermission =>
      async ({ modules, actor, projectId }) => {
        const { permission, folderGrants } = await modules.secrets.secretsPermissionService.getSecretsPermission({
          actor,
          projectId
        });
        onFolderGrants(folderGrants.list);
        return permission;
      };

    const kmsPermission: TCurrentProjectPermission = ({ modules, actor, projectId }) =>
      modules.kms.kmsPermissionService.getKmsPermission({ actor, projectId });

    const agentVaultPermission: TCurrentProjectPermission = async ({ modules, actor, projectId }) =>
      (await modules.agentVault.accessBundlePermissionService.getAgentVaultPermission({ actor, projectId })).permission;

    // secret_folders belongs to Secret Manager but no domain owns it yet, so the spec writes the rows directly: one
    // root in prod with the named folders under it.
    const addFolders = async (tenant: TTenant, names: string[]) => {
      const prod = tenant.environments.find((env) => env.slug === "prod")!;
      const [root] = await h.db(TableName.SecretFolder).insert({ name: "root", envId: prod.id }).returning("*");
      return Promise.all(
        names.map(async (name) => {
          const [folder] = await h
            .db(TableName.SecretFolder)
            .insert({ name, envId: prod.id, parentId: root.id })
            .returning("*");
          return folder;
        })
      );
    };

    const folderGrant = async (
      tenant: TTenant,
      actor: TSeedActor,
      folder: { id: string },
      role: SecretFolderRole,
      endsAt?: Date
    ) => {
      const privilege = await seed().privilege({
        actor,
        projectId: tenant.project.id,
        folder: { id: folder.id, role }
      });
      if (endsAt) {
        await h.db(TableName.AdditionalPrivilege).where({ id: privilege.id }).update(temporaryColumns(endsAt));
      }
      return privilege;
    };

    const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));

    const folderGrantView = (grants: TFolderGrantView[]) =>
      byId(grants).map(({ id, folderId, role, environmentSlug, secretPath }) => ({
        id,
        folderId,
        role,
        environmentSlug,
        secretPath
      }));

    test("should match getSecretsPermission and its folder grants for a member and for an admin with a stale grant", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: user.id }, [{ role: ProjectMembershipRole.Viewer }]);
      const [app, billing, old] = await addFolders(tenant, ["app", "billing", "old"]);
      await folderGrant(tenant, { userId: user.id }, app, SecretFolderRole.Edit);
      await folderGrant(tenant, { userId: user.id }, billing, SecretFolderRole.List, new Date(Date.now() + 3_600_000));
      await folderGrant(tenant, { userId: user.id }, old, SecretFolderRole.Manage, PAST());
      await folderGrant(tenant, { userId: tenant.admin.id }, app, SecretFolderRole.Read);
      const identity = await newIdentityInOrg(tenant.org.id);
      await projectRoles(tenant, { identityId: identity.id }, [{ role: ProjectMembershipRole.NoAccess }]);
      await folderGrant(tenant, { identityId: identity.id }, billing, SecretFolderRole.Read);

      // Action and assert
      for (const principal of [userPrincipal(user), userPrincipal(tenant.admin), identityPrincipal(identity)]) {
        let current: TFolderGrantView[] = [];
        // oxlint-disable-next-line no-await-in-loop
        const { legacyResult } = await compareProject({
          principal,
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          type: ProjectType.SecretManager,
          current: secretsPermission((grants) => {
            current = grants;
          })
        });
        expect(folderGrantView(current)).toEqual(folderGrantView(legacyResult.folderScopedPrivileges));
      }
      const { modules } = build();
      const userActor = await modules.organizations.actorContextService.forPrincipal({
        principal: userPrincipal(user),
        orgId: tenant.org.id
      });
      const { folderGrants } = await modules.secrets.secretsPermissionService.getSecretsPermission({
        actor: userActor,
        projectId: tenant.project.id
      });
      expect(folderGrants.list.map(({ secretPath }) => secretPath).sort()).toEqual(["/app", "/billing"]);
    });

    test.each([ProjectMembershipRole.NoAccess, ProjectMembershipRole.Viewer, ProjectMembershipRole.Member])(
      "should match getSecretsPermission for a %s with a grant on the root that applies to subfolders and exact grants below it",
      async (baseRole) => {
        // Setup
        const tenant = await h.newTenant();
        const user = await newUserInOrg(tenant.org.id);
        await projectRoles(tenant, { userId: user.id }, [{ role: baseRole }]);
        const prod = tenant.environments.find((env) => env.slug === "prod")!;
        const [root] = await h.db(TableName.SecretFolder).insert({ name: "root", envId: prod.id }).returning("*");
        const [app, billing] = await Promise.all(
          ["app", "billing"].map(async (name) => {
            const [folder] = await h
              .db(TableName.SecretFolder)
              .insert({ name, envId: prod.id, parentId: root.id })
              .returning("*");
            return folder;
          })
        );
        const recursive = await folderGrant(tenant, { userId: user.id }, root, SecretFolderRole.Edit);
        await h.db(TableName.AdditionalPrivilege).where({ id: recursive.id }).update({ appliesToSubfolders: true });
        await folderGrant(tenant, { userId: user.id }, app, SecretFolderRole.Read);
        await folderGrant(tenant, { userId: user.id }, billing, SecretFolderRole.FullAccess);

        // Action and assert
        await compareProject({
          principal: userPrincipal(user),
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          type: ProjectType.SecretManager,
          current: secretsPermission(() => undefined)
        });
      }
    );

    test("should match grant permissions, audit sources and the project member listing with folder grants", async () => {
      // Setup
      const tenant = await h.newTenant();
      const [app, billing, old] = await addFolders(tenant, ["app", "billing", "old"]);
      const placeholderRole = await customRole({ projectId: tenant.project.id }, [
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { secretPath: "/users/{{identity.username}}" }
        }
      ]);

      const viewer = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: viewer.id }, [
        { role: ProjectMembershipRole.Viewer },
        { role: ProjectMembershipRole.Custom, customRoleId: placeholderRole.id }
      ]);
      await seed().privilege({
        actor: { userId: viewer.id },
        projectId: tenant.project.id,
        permissions: packRules<TRule>([{ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags }])
      });
      await folderGrant(tenant, { userId: viewer.id }, app, SecretFolderRole.Edit);
      await folderGrant(tenant, { userId: viewer.id }, old, SecretFolderRole.Manage, PAST());

      const groupOnly = await newUserInOrg(tenant.org.id);
      const group = await seed().group({ orgId: tenant.org.id });
      await seed().groupMember({ groupId: group.id, userId: groupOnly.id });
      await seed().membership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { groupId: group.id },
        roles: [
          { role: ProjectMembershipRole.Member },
          { role: ProjectMembershipRole.Custom, customRoleId: placeholderRole.id }
        ]
      });
      await folderGrant(tenant, { userId: groupOnly.id }, billing, SecretFolderRole.Read);

      const formerAdmin = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: formerAdmin.id }, [
        { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: PAST() },
        { role: ProjectMembershipRole.Member }
      ]);
      await folderGrant(tenant, { userId: formerAdmin.id }, app, SecretFolderRole.List);

      const identity = await newIdentityInOrg(tenant.org.id);
      await projectRoles(tenant, { identityId: identity.id }, [{ role: ProjectMembershipRole.Viewer }]);
      await folderGrant(tenant, { identityId: identity.id }, billing, SecretFolderRole.List);

      const { legacy, modules } = build();
      const { projectPermissionService } = modules.projects;
      const { secretsPermissionService } = modules.secrets;
      const scope = { orgId: tenant.org.id, projectId: tenant.project.id };

      // Action and assert: grant permissions (privilege boundaries)
      for (const actor of [
        { type: ActorType.USER as const, id: viewer.id, name: viewer.username },
        { type: ActorType.USER as const, id: formerAdmin.id, name: formerAdmin.username },
        { type: ActorType.IDENTITY as const, id: identity.id, name: identity.name }
      ]) {
        // oxlint-disable-next-line no-await-in-loop
        const legacyGrants = await legacy.getActorGrantAbilities({
          scopeData: { scope: AccessScope.Project, ...scope },
          actorId: actor.id,
          actorType: actor.type
        });
        // oxlint-disable-next-line no-await-in-loop
        const { grants } = await projectPermissionService.getPermissionAuditSources({ target: actor, ...scope });
        // oxlint-disable-next-line no-await-in-loop
        const [rolePermissions, folderPermissions] = await Promise.all([
          projectPermissionService.getGrantPermissions({ actor, ...scope }),
          secretsPermissionService.getFolderGrantPermissions({
            target: actor,
            projectId: tenant.project.id,
            grants
          })
        ]);
        expect(folderPermissions.length).toBeGreaterThan(0);
        expect(asSet([...rolePermissions, ...folderPermissions])).toEqual(
          asSet(legacyGrants.map(({ permission }) => permission))
        );
      }

      // Action and assert: permission audit
      for (const target of [viewer, formerAdmin]) {
        // oxlint-disable-next-line no-await-in-loop
        const legacyAudit = await legacy.getMembershipPermissionAudit({
          actor: ActorType.USER,
          actorId: tenant.admin.id,
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: tenant.org.id,
          projectId: tenant.project.id,
          targetUserId: target.id,
          includeFolderPermissions: true
        });
        const targetActor = { type: ActorType.USER as const, id: target.id };
        // oxlint-disable-next-line no-await-in-loop
        const { sources, grants } = await projectPermissionService.getPermissionAuditSources({
          target: targetActor,
          ...scope
        });
        // oxlint-disable-next-line no-await-in-loop
        const folderSources = await secretsPermissionService.getFolderGrantAuditSources({
          target: targetActor,
          projectId: tenant.project.id,
          grants
        });
        expect(folderSources).toHaveLength(1);
        expect(byId([...sources, ...folderSources])).toEqual(byId(legacyAudit.sources));
      }

      // Action and assert: the project member listing
      const [legacyListing, currentListing] = await Promise.all([
        legacy.getProjectPermissions(tenant.project.id, tenant.org.id),
        secretsPermissionService.getProjectMemberPermissions(scope)
      ]);
      const directView = (
        members: {
          id: string;
          name: string;
          membershipId: string;
          roles: { id: string }[];
          additionalPrivileges: { id: string; name: string }[];
          permission: { rules: object[] };
          accessSources: () => { key: string; permission: { rules: object[] } }[];
        }[]
      ) =>
        byId(members).map((member) => ({
          id: member.id,
          name: member.name,
          membershipId: member.membershipId,
          roles: byId(member.roles),
          additionalPrivileges: byId(member.additionalPrivileges),
          rules: decisionShape(member.permission.rules),
          accessSources: member
            .accessSources()
            .map(({ key, permission }) => ({ key, rules: decisionShape(permission.rules) }))
            .sort((a, b) => a.key.localeCompare(b.key))
        }));
      const groupView = (
        groups: { id: string; name: string; membershipId: string; roles: object[]; permission: { rules: object[] } }[]
      ) =>
        byId(groups).map((entry) => ({
          id: entry.id,
          name: entry.name,
          membershipId: entry.membershipId,
          roles: entry.roles.map((role) => JSON.stringify(role)).sort(),
          rules: decisionShape(entry.permission.rules)
        }));
      const folderAccessView = (byActor: Map<string, TFolderGrantView[]>) =>
        [...byActor.entries()]
          .map(([actorId, grants]) => ({ actorId, grants: folderGrantView(grants) }))
          .sort((a, b) => a.actorId.localeCompare(b.actorId));

      expect(directView(currentListing.userPermissions)).toEqual(directView(legacyListing.userPermissions));
      expect(directView(currentListing.identityPermissions)).toEqual(directView(legacyListing.identityPermissions));
      expect(groupView(currentListing.groupPermissions)).toEqual(groupView(legacyListing.groupPermissions));
      expect(folderAccessView(currentListing.folderAccessByActorId)).toEqual(
        folderAccessView(legacyListing.folderAccessByActorId)
      );
      expect(currentListing.groupRulesHavePlaceholders).toBe(legacyListing.groupRulesHavePlaceholders);
      expect(currentListing.groupRulesHavePlaceholders).toBe(true);
      const actorQueries = [
        { actorId: viewer.id, groupIds: [] },
        { actorId: formerAdmin.id, groupIds: [] },
        { actorId: identity.id, groupIds: [] },
        { actorId: groupOnly.id, groupIds: [group.id], username: groupOnly.username, metadata: [] },
        { actorId: viewer.id, groupIds: [group.id], groupsOnly: true },
        { actorId: groupOnly.id, groupIds: [group.id], username: groupOnly.username, groupsOnly: true }
      ];
      expect(actorQueries.map((query) => decisionShape(currentListing.permissionForActor(query).rules))).toEqual(
        actorQueries.map((query) => decisionShape(legacyListing.permissionForActor(query).rules))
      );
    });

    test("should match a PAM project admin and member, and a custom role with a privilege resolving to the member rules", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.PAM });
      const member = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: member.id }, [{ role: ProjectMembershipRole.Member }]);
      const custom = await newUserInOrg(tenant.org.id);
      const role = await customRole({ projectId: tenant.project.id }, [
        { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags }
      ]);
      await projectRoles(tenant, { userId: custom.id }, [
        { role: ProjectMembershipRole.Custom, customRoleId: role.id }
      ]);
      await seed().privilege({
        actor: { userId: custom.id },
        projectId: tenant.project.id,
        permissions: packRules<TRule>([{ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.Tags }])
      });

      // Action and assert
      const compare = (principal: TPrincipal) =>
        compareProject({
          principal,
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          type: ProjectType.PAM,
          roles: productProjectRoles(),
          extraSlugs: [role.slug]
        });
      const admin = await compare(userPrincipal(tenant.admin));
      expect(admin.permission.hasRole({ slug: ProjectMembershipRole.Admin })).toBe(true);
      for (const principal of [userPrincipal(member), userPrincipal(custom)]) {
        // oxlint-disable-next-line no-await-in-loop
        const { permission } = await compare(principal);
        expect(decisionShape(permission.rules)).toEqual(decisionShape(pamProjectMemberPermissions));
      }
    });

    test.each(["admin", "operator", "connector", "auditor"])(
      "should match PAM folder and account permission for the %s resource role",
      async (role) => {
        // Setup
        const tenant = await h.newTenant({ projectType: ProjectType.PAM });
        const user = await newUserInOrg(tenant.org.id);
        await projectRoles(tenant, { userId: user.id }, [{ role: ProjectMembershipRole.Member }]);
        const folder = newResource(ResourceType.PamFolder);
        const account = newResource(ResourceType.PamAccount);
        await resourceRoles(tenant, folder, { userId: user.id }, [{ role }]);
        await resourceRoles(tenant, account, { userId: user.id }, [{ role }]);

        // Action and assert
        for (const resource of [folder, account]) {
          // oxlint-disable-next-line no-await-in-loop
          const { permission } = await compareResource({ principal: userPrincipal(user), tenant, resource });
          expect(permission.rules.length).toBeGreaterThan(0);
          expect(permission.hasRole({ slug: role })).toBe(true);
        }
      }
    );

    test("should match PAM resource permission for a project admin, an org member outside the project, a folder and an account together, and refuse a member with no role alike", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.PAM });
      const folder = newResource(ResourceType.PamFolder);
      const account = newResource(ResourceType.PamAccount);
      const otherFolder = newResource(ResourceType.PamFolder);
      await resourceRoles(tenant, otherFolder, { userId: tenant.admin.id }, [{ role: "operator" }]);
      const outsider = await newUserInOrg(tenant.org.id);
      await resourceRoles(tenant, folder, { userId: outsider.id }, [{ role: "auditor" }]);
      const both = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: both.id }, [{ role: ProjectMembershipRole.Member }]);
      await resourceRoles(tenant, folder, { userId: both.id }, [{ role: "connector" }]);
      await resourceRoles(tenant, account, { userId: both.id }, [{ role: "auditor" }]);
      const roleless = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: roleless.id }, [{ role: ProjectMembershipRole.Member }]);

      // Action and assert
      const implicit = await compareResource({ principal: userPrincipal(tenant.admin), tenant, resource: folder });
      expect(implicit.permission.isImplicitAdmin).toBe(true);
      expect(implicit.permission.rules).toEqual([]);
      const held = await compareResource({ principal: userPrincipal(tenant.admin), tenant, resource: otherFolder });
      expect(held.permission.hasRole({ slug: "operator" })).toBe(true);
      await compareResource({ principal: userPrincipal(outsider), tenant, resource: folder });
      await compareResourceRefusal({ principal: userPrincipal(roleless), tenant, resource: folder });
      await compareResourceRefusal({ principal: userPrincipal(roleless), tenant, resource: account });

      // Legacy has no single permission for an account in a folder: checkAccountAccess tries the folder, then the
      // account, so what it allows is the folder's rules and the account's together.
      const { legacy, modules } = build({ projectRoles: productProjectRoles() });
      const principal = userPrincipal(both);
      legacyRequestContext(principal);
      const legacyRules = await Promise.all(
        [folder, account].map(async (resource) => {
          const { permission } = await legacy.getResourcePermission({
            ...legacyArgs(principal, tenant.org.id),
            projectId: tenant.project.id,
            ...resource
          });
          return permission.rules;
        })
      );
      const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId: tenant.org.id });
      const together = await modules.pam.pamPermissionService.getPamPermission({
        actor,
        projectId: tenant.project.id,
        folderId: folder.resourceId,
        accountId: account.resourceId
      });
      expect(decisionShape(together.rules)).toEqual(decisionShape(legacyRules.flat()));
      expect(["connector", "auditor"].map((slug) => together.hasRole({ slug }))).toEqual([true, true]);
    });

    test("should match an Agent Vault project admin and member, and an access bundle consumer", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.AgentVault });
      const bundleA = newResource(ResourceType.AgentVaultAccessBundle);
      const bundleB = newResource(ResourceType.AgentVaultAccessBundle);
      const consumer = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: consumer.id }, [{ role: ProjectMembershipRole.Member }]);
      await resourceRoles(tenant, bundleA, { userId: consumer.id }, [{ role: "consumer" }]);
      const viaGroup = await newUserInOrg(tenant.org.id);
      const group = await seed().group({ orgId: tenant.org.id });
      await seed().groupMember({ groupId: group.id, userId: viaGroup.id });
      await seed().membership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { groupId: group.id },
        roles: [{ role: ProjectMembershipRole.Member }]
      });
      await resourceRoles(tenant, bundleB, { groupId: group.id }, [{ role: "consumer" }]);
      await resourceRoles(tenant, bundleA, { userId: tenant.admin.id }, [{ role: "consumer" }]);
      const ungranted = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: ungranted.id }, [{ role: ProjectMembershipRole.Member }]);

      // Action and assert
      const principals = [tenant.admin, consumer, viaGroup, ungranted].map((user) => userPrincipal(user));
      for (const principal of principals) {
        // oxlint-disable-next-line no-await-in-loop
        await compareProject({
          principal,
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          type: ProjectType.AgentVault,
          roles: productProjectRoles(),
          current: agentVaultPermission
        });
      }

      const { modules } = build({ projectRoles: productProjectRoles() });
      const reachOf = async (user: { id: string; username: string }) => {
        const actor = await modules.organizations.actorContextService.forPrincipal({
          principal: userPrincipal(user),
          orgId: tenant.org.id
        });
        return modules.agentVault.accessBundlePermissionService.getGrantedAccessBundlePermission({
          actor,
          projectId: tenant.project.id
        });
      };
      expect(await reachOf(tenant.admin)).toMatchObject({
        reachesEveryBundle: true,
        accessBundleIds: null,
        grantedAccessBundleIds: [bundleA.resourceId]
      });
      expect(await reachOf(viaGroup)).toMatchObject({ accessBundleIds: [bundleB.resourceId] });

      const consumed = await compareResource({ principal: userPrincipal(consumer), tenant, resource: bundleA });
      expect(consumed.permission.hasRole({ slug: "consumer" })).toBe(true);
      const implicit = await compareResource({ principal: userPrincipal(tenant.admin), tenant, resource: bundleB });
      expect(implicit.permission.isImplicitAdmin).toBe(true);
      await compareResource({ principal: userPrincipal(viaGroup), tenant, resource: bundleB });
      await compareResourceRefusal({ principal: userPrincipal(ungranted), tenant, resource: bundleA });
    });

    describe.each([
      { product: "Cert Manager", resourceType: ResourceType.CertificateApplication },
      { product: "code signing", resourceType: ResourceType.Signer }
    ])("$product resource permission", ({ resourceType }) => {
      test.each([ResourceMembershipRole.Admin, ResourceMembershipRole.Operator, ResourceMembershipRole.Auditor])(
        "should match for the %s role",
        async (role) => {
          // Setup
          const tenant = await h.newTenant({ projectType: ProjectType.CertificateManager });
          const user = await newUserInOrg(tenant.org.id);
          await projectRoles(tenant, { userId: user.id }, [{ role: ProjectMembershipRole.Member }]);
          const resource = newResource(resourceType);
          await resourceRoles(tenant, resource, { userId: user.id }, [{ role }]);

          // Action and assert
          const { permission } = await compareResource({ principal: userPrincipal(user), tenant, resource });
          expect(permission.rules.length).toBeGreaterThan(0);
          expect(permission.hasRole({ slug: role })).toBe(true);
        }
      );

      test("should match for the project admin with and without a role, and refuse a custom or unknown role and a member with no role alike", async () => {
        // Setup
        const tenant = await h.newTenant({ projectType: ProjectType.CertificateManager });
        const resource = newResource(resourceType);
        const held = newResource(resourceType);
        await resourceRoles(tenant, held, { userId: tenant.admin.id }, [{ role: ResourceMembershipRole.Auditor }]);
        const custom = await newUserInOrg(tenant.org.id);
        await projectRoles(tenant, { userId: custom.id }, [{ role: ProjectMembershipRole.Member }]);
        await resourceRoles(tenant, resource, { userId: custom.id }, [{ role: ResourceMembershipRole.Custom }]);
        const unknown = await newUserInOrg(tenant.org.id);
        await projectRoles(tenant, { userId: unknown.id }, [{ role: ProjectMembershipRole.Member }]);
        await resourceRoles(tenant, resource, { userId: unknown.id }, [{ role: "owner" }]);
        const roleless = await newUserInOrg(tenant.org.id);
        await projectRoles(tenant, { userId: roleless.id }, [{ role: ProjectMembershipRole.Member }]);

        // Action and assert
        const implicit = await compareResource({ principal: userPrincipal(tenant.admin), tenant, resource });
        expect(implicit.permission.isImplicitAdmin).toBe(true);
        expect(implicit.permission.rules.length).toBeGreaterThan(0);
        const withRole = await compareResource({ principal: userPrincipal(tenant.admin), tenant, resource: held });
        expect(decisionShape(withRole.permission.rules)).not.toEqual(decisionShape(implicit.permission.rules));
        for (const user of [custom, unknown, roleless]) {
          // oxlint-disable-next-line no-await-in-loop
          await compareResourceRefusal({ principal: userPrincipal(user), tenant, resource });
        }
      });
    });

    test("should match the cryptographic operator role in a KMS project, through the KMS product service and by role", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.KMS });
      const operator = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: operator.id }, [{ role: ProjectMembershipRole.KmsCryptographicOperator }]);
      const viewer = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: viewer.id }, [
        { role: ProjectMembershipRole.Viewer },
        { role: ProjectMembershipRole.KmsCryptographicOperator }
      ]);

      // Action and assert
      for (const user of [operator, viewer]) {
        // oxlint-disable-next-line no-await-in-loop
        const { permission } = await compareProject({
          principal: userPrincipal(user),
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          type: ProjectType.KMS,
          roles: productProjectRoles(),
          current: kmsPermission
        });
        expect(permission.hasRole({ slug: ProjectMembershipRole.KmsCryptographicOperator })).toBe(true);
        expect(
          permission.can({
            action: ProjectPermissionCmekActions.Encrypt,
            subject: ProjectPermissionSub.Cmek
          })
        ).toBe(true);
      }

      const { legacy, modules } = build({ projectRoles: productProjectRoles() });
      const { projectPermissionService } = modules.projects;
      const slugs = [ProjectMembershipRole.KmsCryptographicOperator, ProjectMembershipRole.Viewer];
      const [legacyByRoles, currentByRoles] = await Promise.all([
        legacy.getProjectPermissionByRoles(slugs, tenant.project.id),
        projectPermissionService.getProjectPermissionByRoles({ projectId: tenant.project.id, roles: slugs })
      ]);
      expect(currentByRoles.map(({ permission }) => decisionShape(permission.rules))).toEqual(
        legacyByRoles.map(({ permission }) => decisionShape(permission.rules))
      );
      const scope = { orgId: tenant.org.id, projectId: tenant.project.id };
      const [legacyGrants, currentGrants] = await Promise.all([
        legacy.getActorGrantAbilities({
          scopeData: { scope: AccessScope.Project, ...scope },
          actorId: viewer.id,
          actorType: ActorType.USER
        }),
        projectPermissionService.getGrantPermissions({
          actor: { type: ActorType.USER, id: viewer.id, name: viewer.username },
          ...scope
        })
      ]);
      expect(asSet(currentGrants)).toEqual(asSet(legacyGrants.map(({ permission }) => permission)));
      const [legacyAudit, currentAudit] = await Promise.all([
        legacy.getMembershipPermissionAudit({
          actor: ActorType.USER,
          actorId: tenant.admin.id,
          actorAuthMethod: AuthMethod.EMAIL,
          actorOrgId: tenant.org.id,
          projectId: tenant.project.id,
          targetUserId: viewer.id,
          includeFolderPermissions: true
        }),
        projectPermissionService.getPermissionAuditSources({
          target: { type: ActorType.USER, id: viewer.id },
          ...scope
        })
      ]);
      expect(byId(currentAudit.sources)).toEqual(byId(legacyAudit.sources));
    });

    test("should give a KMS project's member listing the cryptographic operator, as legacy did", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.KMS });
      const viewer = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: viewer.id }, [
        { role: ProjectMembershipRole.Viewer },
        { role: ProjectMembershipRole.KmsCryptographicOperator }
      ]);
      const { legacy, modules } = build({ projectRoles: productProjectRoles() });

      // Action
      const [legacyListing, currentListing] = await Promise.all([
        legacy.getProjectPermissions(tenant.project.id, tenant.org.id),
        modules.secrets.secretsPermissionService.getProjectMemberPermissions({
          orgId: tenant.org.id,
          projectId: tenant.project.id
        })
      ]);

      // Assert
      const encrypt = { action: ProjectPermissionCmekActions.Encrypt, subject: ProjectPermissionSub.Cmek } as const;
      const legacyViewer = legacyListing.userPermissions.find(({ id }) => id === viewer.id)!;
      const currentViewer = currentListing.userPermissions.find(({ id }) => id === viewer.id)!;
      expect(currentViewer.permission.can(encrypt)).toBe(true);
      expect(decisionShape(currentViewer.permission.rules)).toEqual(decisionShape(legacyViewer.permission.rules));
      const query = { actorId: viewer.id, groupIds: [] };
      expect(decisionShape(currentListing.permissionForActor(query).rules)).toEqual(
        decisionShape(legacyListing.permissionForActor(query).rules)
      );
    });

    test("should give a KMS project admin CMEK PublishPublicKey through the KMS product service, as legacy did", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.KMS });

      // Action
      const { legacyResult, permission } = await compareProject({
        principal: userPrincipal(tenant.admin),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.KMS,
        roles: productProjectRoles(),
        current: kmsPermission
      });

      // Assert
      expect(
        legacyResult.permission.can(ProjectPermissionCmekActions.PublishPublicKey, ProjectPermissionSub.Cmek)
      ).toBe(true);
      expect(
        permission.can({
          action: ProjectPermissionCmekActions.PublishPublicKey,
          subject: ProjectPermissionSub.Cmek
        })
      ).toBe(true);
    });

    test("should keep the cryptographic operator role outside a KMS project, as legacy did", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: user.id }, [
        { role: ProjectMembershipRole.Viewer },
        { role: ProjectMembershipRole.KmsCryptographicOperator }
      ]);
      const principal = userPrincipal(user);
      const { legacy, modules } = build({ projectRoles: productProjectRoles() });
      legacyRequestContext(principal);

      // Action
      const legacyResult = await legacy.getProjectPermission({
        ...legacyArgs(principal, tenant.org.id),
        projectId: tenant.project.id,
        actionProjectType: ActionProjectType.SecretManager
      });
      const actor = await modules.organizations.actorContextService.forPrincipal({ principal, orgId: tenant.org.id });
      const permission = await modules.projects.projectPermissionService.getProjectPermission({
        actor,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });

      // Assert
      expect(decisionShape(permission.rules)).toEqual(decisionShape(legacyResult.permission.rules));
      expect(permission.hasRole({ slug: ProjectMembershipRole.KmsCryptographicOperator })).toBe(
        legacyResult.hasRole(ProjectMembershipRole.KmsCryptographicOperator)
      );
    });

    test.each([
      [ProjectType.PAM, ProjectMembershipRole.Viewer],
      [ProjectType.PAM, ProjectMembershipRole.NoAccess],
      [ProjectType.PAM, "ssh-host-bootstrapper"],
      [ProjectType.AgentVault, ProjectMembershipRole.Viewer],
      [ProjectType.AgentVault, ProjectMembershipRole.NoAccess],
      [ProjectType.AgentVault, "ssh-host-bootstrapper"]
    ])("should resolve a %s project member holding %s to the member rules alike", async (type, role) => {
      // Setup
      const tenant = await h.newTenant({ projectType: type });
      const user = await newUserInOrg(tenant.org.id);
      await projectRoles(tenant, { userId: user.id }, [{ role }]);

      // Action
      const { permission } = await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type,
        roles: productProjectRoles(),
        current: type === ProjectType.AgentVault ? agentVaultPermission : genericProjectPermission,
        extraSlugs: [role]
      });

      // Assert
      const memberRules = type === ProjectType.PAM ? pamProjectMemberPermissions : agentVaultProjectMemberPermissions;
      expect(decisionShape(permission.rules)).toEqual(decisionShape(memberRules));
    });

    test("should give a delegated OAuth token hasRole false on the PAM, Agent Vault, Cert Manager and code signing paths alike", async () => {
      // Setup
      const pamTenant = await h.newTenant({ projectType: ProjectType.PAM });
      const agentVaultTenant = await h.newTenant({ projectType: ProjectType.AgentVault });
      const certTenant = await h.newTenant({ projectType: ProjectType.CertificateManager });
      const pamFolder = newResource(ResourceType.PamFolder);
      await resourceRoles(pamTenant, pamFolder, { userId: pamTenant.admin.id }, [{ role: "admin" }]);
      const application = newResource(ResourceType.CertificateApplication);
      const signer = newResource(ResourceType.Signer);
      await resourceRoles(certTenant, application, { userId: certTenant.admin.id }, [
        { role: ResourceMembershipRole.Admin }
      ]);
      await resourceRoles(certTenant, signer, { userId: certTenant.admin.id }, [
        { role: ResourceMembershipRole.Admin }
      ]);
      const oauth = (tenant: TTenant) =>
        userPrincipal(tenant.admin, { oauth: { clientId: "client", scopes: ["secrets:read"] } });

      // Action and assert
      for (const [tenant, type, current] of [
        [pamTenant, ProjectType.PAM, genericProjectPermission],
        [agentVaultTenant, ProjectType.AgentVault, agentVaultPermission]
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop
        const { permission } = await compareProject({
          principal: oauth(tenant),
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          type,
          roles: productProjectRoles(),
          current
        });
        expect(permission.hasRole({ slug: ProjectMembershipRole.Admin })).toBe(false);
      }
      for (const [tenant, resource] of [
        [pamTenant, pamFolder],
        [certTenant, application],
        [certTenant, signer]
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop
        const { permission } = await compareResource({ principal: oauth(tenant), tenant, resource });
        expect(permission.hasRole({ slug: "admin" })).toBe(false);
        expect(permission.rules).toEqual([]);
      }
    });
  });
});
