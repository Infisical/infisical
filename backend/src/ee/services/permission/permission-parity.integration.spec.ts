import { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  ProjectType,
  RESOURCE_SCOPE,
  ResourceMembershipRole,
  ResourceType,
  SecretFolderRole,
  TableName
} from "@app/db/schemas";
import { createDomains } from "@app/domains/domains";
import { randomId, setupIntegration } from "@app/domains/lib/testing/integration";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/domains/platform/organizations/ce/module";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { inMemoryKeyStore } from "@app/keystore/memory";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import { TPrincipal } from "@app/lib/auth/principal";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import { permissionDALFactory } from "./permission-dal";
import { permissionServiceFactory } from "./permission-service";

// The legacy service reads the OAuth scopes, the assumed privilege and the identity's auth info from the request
// context; the new functions read them from the principal. Each case sets both.
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

// CASL decides by the last matching rule, so swapping two neighbouring rules of the same polarity never changes an
// answer, while moving a rule across one of the other polarity can. This keeps the runs of allow and deny rules in
// order and compares each run as a set, so it fails on any difference that could change a decision.
const decisionShape = (rules: object[]) => {
  const runs: { inverted: boolean; rules: string[] }[] = [];
  for (const { inverted = false, ...rule } of rules as { inverted?: boolean }[]) {
    const last = runs[runs.length - 1];
    const entry = JSON.stringify(rule);
    if (last && last.inverted === inverted) last.rules.push(entry);
    else runs.push({ inverted, rules: [entry] });
  }
  return runs.map((run) => ({ ...run, rules: run.rules.sort() }));
};

// Compares the legacy permissionService with the domain permission functions over the same rows. Deleted with the legacy
// service.
describe("Permission parity: legacy permissionService and the domain functions", () => {
  const h = setupIntegration();

  beforeEach(() => {
    requestStore.values = {};
  });

  const build = () => {
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
    const domains = createDomains({
      db: h.db,
      keyStore: inMemoryKeyStore(),
      queueService: { queue: vi.fn(), start: vi.fn() },
      cronJob: { register: vi.fn() },
      eventEmitter: { emit: vi.fn() },
      envConfig: { isCloud: false, isProductionMode: false }
    } as unknown as Parameters<typeof createDomains>[0]);
    return { legacy, domains };
  };

  const insertMembership = async ({
    scope,
    orgId,
    projectId,
    resource,
    actor,
    roles
  }: {
    scope: AccessScope | typeof RESOURCE_SCOPE;
    orgId: string;
    projectId?: string;
    resource?: { type: ResourceType; id: string };
    actor: { userId?: string; identityId?: string; groupId?: string };
    roles: { role: string; customRoleId?: string; temporaryAccessEndTime?: Date }[];
  }) => {
    const [membership] = await h
      .db(TableName.Membership)
      .insert({
        scope,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        scopeResourceType: resource?.type,
        scopeResourceId: resource?.id,
        actorUserId: actor.userId,
        actorIdentityId: actor.identityId,
        actorGroupId: actor.groupId,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await h.db(TableName.MembershipRole).insert(
      roles.map(({ role, customRoleId, temporaryAccessEndTime }) => ({
        membershipId: membership.id,
        role,
        customRoleId,
        ...(temporaryAccessEndTime
          ? {
              isTemporary: true,
              temporaryMode: "relative",
              temporaryRange: "1h",
              temporaryAccessStartTime: new Date(0),
              temporaryAccessEndTime
            }
          : {})
      }))
    );
    return membership;
  };

  const insertCustomRole = async ({
    orgId,
    projectId,
    rules
  }: {
    orgId?: string;
    projectId?: string;
    rules: TRule[] | RawRuleOf<MongoAbility>[];
  }) => {
    const slug = `custom-${randomId()}`;
    const [role] = await h
      .db(TableName.Role)
      .insert({ name: slug, slug, orgId, projectId, permissions: JSON.stringify(packRules(rules as TRule[])) })
      .returning("*");
    return role;
  };

  const insertIdentity = async (orgId: string) => {
    const [identity] = await h
      .db(TableName.Identity)
      .insert({ name: `identity-${randomId()}`, orgId })
      .returning("*");
    await insertMembership({
      scope: AccessScope.Organization,
      orgId,
      actor: { identityId: identity.id },
      roles: [{ role: OrgMembershipRole.Member }]
    });
    return identity;
  };

  const newUserInOrg = async (orgId: string, orgRole: string = OrgMembershipRole.Member) => {
    const user = await h.factories.user();
    await insertMembership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId: user.id },
      roles: [{ role: orgRole }]
    });
    return user;
  };

  const userPrincipal = (user: { id: string; username: string }, extra: Partial<TPrincipal> = {}): TPrincipal =>
    ({
      type: ActorType.USER,
      id: user.id,
      username: user.username,
      email: null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false,
      ...extra
    }) as TPrincipal;

  const identityPrincipal = (identity: { id: string; name: string }, extra: Partial<TPrincipal> = {}): TPrincipal =>
    ({
      type: ActorType.IDENTITY,
      id: identity.id,
      name: identity.name,
      isInstanceAdmin: false,
      ...extra
    }) as TPrincipal;

  const legacyArgs = (principal: TPrincipal, orgId: string) => ({
    actor: principal.type as ActorType.USER,
    actorId: principal.id,
    actorAuthMethod: AuthMethod.EMAIL,
    actorOrgId: orgId
  });

  const compareProject = async ({
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
    const { legacy, domains } = build();
    const legacyResult = await legacy.getProjectPermission({
      ...legacyArgs(principal, orgId),
      projectId,
      actionProjectType: type as unknown as ActionProjectType
    });
    const actor = await domains.actorContexts.forPrincipal(principal, orgId);
    const current =
      type === ProjectType.SecretManager
        ? await domains.secrets.service.getSecretsPermission({ actor, projectId })
        : { permission: await domains.projects.service.getProjectPermission({ actor, projectId, type }) };

    expect(decisionShape(current.permission.rules)).toEqual(decisionShape(legacyResult.permission.rules));
    return { legacyResult, current };
  };

  const compareOrg = async ({ principal, orgId }: { principal: TPrincipal; orgId: string }) => {
    const { legacy, domains } = build();
    const legacyResult = await legacy.getOrgPermission({
      ...legacyArgs(principal, orgId),
      orgId,
      scope: OrganizationActionScope.Any
    });
    const actor = await domains.actorContexts.forPrincipal(principal, orgId);
    const current = await domains.organizations.service.getOrgPermission({ actor });

    expect(decisionShape(current.rules)).toEqual(decisionShape(legacyResult.permission.rules));
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

    test("should match for a user with a custom org role", async () => {
      // Setup
      const org = await h.factories.organization();
      const role = await insertCustomRole({
        orgId: org.id,
        rules: [{ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member }]
      });
      const user = await h.factories.user();
      await insertMembership({
        scope: AccessScope.Organization,
        orgId: org.id,
        actor: { userId: user.id },
        roles: [{ role: OrgMembershipRole.Custom, customRoleId: role.id }]
      });

      // Action and assert
      await compareOrg({ principal: userPrincipal(user), orgId: org.id });
    });

    test("should match for an identity", async () => {
      // Setup
      const org = await h.factories.organization();
      const identity = await insertIdentity(org.id);

      // Action and assert
      await compareOrg({ principal: identityPrincipal(identity), orgId: org.id });
    });

    test("should match for a user in a sub-org", async () => {
      // Setup
      const root = await h.factories.organization();
      const child = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
      const user = await newUserInOrg(root.id);
      await insertMembership({
        scope: AccessScope.Organization,
        orgId: child.id,
        actor: { userId: user.id },
        roles: [{ role: OrgMembershipRole.Admin }]
      });

      // Action and assert
      await compareOrg({ principal: userPrincipal(user), orgId: child.id });
    });
  });

  describe("Secret Manager project permission", () => {
    test.each([
      ProjectMembershipRole.Admin,
      ProjectMembershipRole.Member,
      ProjectMembershipRole.Viewer,
      ProjectMembershipRole.NoAccess
    ])("should match for a user with the built-in %s project role", async (role) => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await h.factories.projectMembership({
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        userId: user.id,
        role
      });

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
      const role = await insertCustomRole({
        projectId: tenant.project.id,
        rules: [
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
        ]
      });
      const [group] = await h
        .db(TableName.Groups)
        .insert({ orgId: tenant.org.id, name: `group-${randomId()}`, slug: `group-${randomId()}` })
        .returning("*");
      await h.db(TableName.UserGroupMembership).insert({ userId: user.id, groupId: group.id, isPending: false });
      await insertMembership({
        scope: AccessScope.Organization,
        orgId: tenant.org.id,
        actor: { groupId: group.id },
        roles: [{ role: OrgMembershipRole.Member }]
      });
      await insertMembership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { groupId: group.id },
        roles: [{ role: ProjectMembershipRole.Custom, customRoleId: role.id }]
      });
      await h.factories.projectMembership({
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        userId: user.id,
        role: ProjectMembershipRole.Viewer
      });

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should match when a temporary admin role has ended and a viewer role remains", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await insertMembership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { userId: user.id },
        roles: [
          { role: ProjectMembershipRole.Admin, temporaryAccessEndTime: new Date(Date.now() - 1000) },
          { role: ProjectMembershipRole.Member, temporaryAccessEndTime: new Date(Date.now() + 3_600_000) },
          { role: ProjectMembershipRole.Viewer }
        ]
      });

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should match with a project-wide additional privilege and a folder grant", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await h.factories.projectMembership({
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        userId: user.id,
        role: ProjectMembershipRole.Viewer
      });
      await h.db(TableName.AdditionalPrivilege).insert({
        name: `privilege-${randomId()}`,
        actorUserId: user.id,
        projectId: tenant.project.id,
        permissions: JSON.stringify(
          packRules<TRule>([
            { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags },
            {
              action: ProjectPermissionSecretActions.Create,
              subject: ProjectPermissionSub.Secrets,
              conditions: { environment: "dev" }
            }
          ])
        )
      });
      const prod = tenant.environments.find((env) => env.slug === "prod")!;
      const [root] = await h.db(TableName.SecretFolder).insert({ name: "root", envId: prod.id }).returning("*");
      const [app] = await h
        .db(TableName.SecretFolder)
        .insert({ name: "app", envId: prod.id, parentId: root.id })
        .returning("*");
      await h.db(TableName.AdditionalPrivilege).insert({
        name: `grant-${randomId()}`,
        actorUserId: user.id,
        projectId: tenant.project.id,
        folderId: app.id,
        role: SecretFolderRole.Edit
      });

      // Action
      const { legacyResult, current } = await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });

      // Assert
      expect((current as { folderGrants: unknown[] }).folderGrants).toEqual(legacyResult.folderScopedPrivileges);
    });

    test("should match for an identity whose custom role reads its metadata and auth info", async () => {
      // Setup
      const tenant = await h.newTenant();
      const identity = await insertIdentity(tenant.org.id);
      await h.db(TableName.IdentityMetadata).insert({
        orgId: tenant.org.id,
        identityId: identity.id,
        key: "team",
        value: "payments"
      });
      const role = await insertCustomRole({
        projectId: tenant.project.id,
        rules: [
          {
            action: ProjectPermissionSecretActions.ReadValue,
            subject: ProjectPermissionSub.Secrets,
            conditions: {
              environment: "prod",
              secretPath: "/{{identity.metadata.team}}/{{identity.auth.kubernetes.namespace}}"
            }
          }
        ]
      });
      await insertMembership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { identityId: identity.id },
        roles: [{ role: ProjectMembershipRole.Custom, customRoleId: role.id }]
      });
      const authInfo = {
        identityId: identity.id,
        identityName: identity.name,
        authMethod: "kubernetes-auth",
        kubernetes: { namespace: "billing" }
      };
      requestStore.values[RequestContextKey.IdentityAuthInfo] = authInfo;

      // Action and assert
      await compareProject({
        principal: identityPrincipal(identity, { authInfo } as Partial<TPrincipal>),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should match for a delegated OAuth token narrowed to secrets:read", async () => {
      // Setup
      const tenant = await h.newTenant();
      const user = await newUserInOrg(tenant.org.id);
      await h.factories.projectMembership({
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        userId: user.id,
        role: ProjectMembershipRole.Member
      });
      requestStore.values[RequestContextKey.OauthScopes] = ["secrets:read"];

      // Action and assert
      await compareProject({
        principal: userPrincipal(user, {
          oauth: { clientId: "client", scopes: ["secrets:read"] }
        } as Partial<TPrincipal>),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });

    test("should match for a user assuming an identity's privileges in the project", async () => {
      // Setup
      const tenant = await h.newTenant();
      const identity = await insertIdentity(tenant.org.id);
      const role = await insertCustomRole({
        projectId: tenant.project.id,
        rules: [
          {
            action: ProjectPermissionSecretActions.ReadValue,
            subject: ProjectPermissionSub.Secrets,
            conditions: { secretPath: "/{{identity.username}}" }
          }
        ]
      });
      await insertMembership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { identityId: identity.id },
        roles: [{ role: ProjectMembershipRole.Custom, customRoleId: role.id }]
      });
      requestStore.values[RequestContextKey.AssumedPrivilegeDetails] = {
        requesterId: tenant.admin.id,
        projectId: tenant.project.id,
        actorType: ActorType.IDENTITY,
        actorId: identity.id
      };

      // Action and assert
      await compareProject({
        principal: userPrincipal(tenant.admin, {
          assumed: {
            projectId: tenant.project.id,
            actorType: ActorType.IDENTITY,
            actorId: identity.id,
            actorName: identity.name
          }
        } as Partial<TPrincipal>),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.SecretManager
      });
    });
  });

  describe("product project permission", () => {
    test.each([
      [ProjectType.PAM, ProjectMembershipRole.Member],
      [ProjectType.PAM, ProjectMembershipRole.Admin],
      [ProjectType.AgentVault, ProjectMembershipRole.Member],
      [ProjectType.KMS, ProjectMembershipRole.KmsCryptographicOperator],
      [ProjectType.KMS, ProjectMembershipRole.Member],
      [ProjectType.CertificateManager, ProjectMembershipRole.Member],
      [ProjectType.SecretScanning, ProjectMembershipRole.Viewer]
    ])("should match in a %s project for the %s role", async (type, role) => {
      // Setup
      const tenant = await h.newTenant({ projectType: type });
      const user = await newUserInOrg(tenant.org.id);
      await h.factories.projectMembership({
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        userId: user.id,
        role
      });

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type
      });
    });

    test("should match for a custom role in a PAM project", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.PAM });
      const user = await newUserInOrg(tenant.org.id);
      const role = await insertCustomRole({
        projectId: tenant.project.id,
        rules: [{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Member }]
      });
      await insertMembership({
        scope: AccessScope.Project,
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        actor: { userId: user.id },
        roles: [{ role: ProjectMembershipRole.Custom, customRoleId: role.id }]
      });

      // Action and assert
      await compareProject({
        principal: userPrincipal(user),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        type: ProjectType.PAM
      });
    });
  });

  describe("certificate application and signer permission", () => {
    const compareResource = async ({
      principal,
      orgId,
      projectId,
      resourceType,
      resourceId
    }: {
      principal: TPrincipal;
      orgId: string;
      projectId: string;
      resourceType: ResourceType;
      resourceId: string;
    }) => {
      const { legacy, domains } = build();
      const legacyResult = await legacy.getResourcePermission({
        ...legacyArgs(principal, orgId),
        projectId,
        resourceType,
        resourceId
      });
      const actor = await domains.actorContexts.forPrincipal(principal, orgId);
      const current =
        resourceType === ResourceType.Signer
          ? await domains.codeSigning.service.getSignerPermission({ actor, projectId, signerId: resourceId })
          : await domains.certManager.service.getApplicationPermission({ actor, projectId, applicationId: resourceId });

      expect(decisionShape(current.rules)).toEqual(decisionShape(legacyResult.permission.rules));
      expect(current.isImplicitAdmin).toBe(legacyResult.isImplicitAdmin);
    };

    test.each([
      [ResourceType.CertificateApplication, ProjectMembershipRole.Admin, undefined],
      [ResourceType.CertificateApplication, ProjectMembershipRole.Admin, ResourceMembershipRole.Operator],
      [ResourceType.CertificateApplication, ProjectMembershipRole.Member, ResourceMembershipRole.Auditor],
      [ResourceType.Signer, ProjectMembershipRole.Admin, undefined],
      [ResourceType.Signer, ProjectMembershipRole.Admin, ResourceMembershipRole.Auditor],
      [ResourceType.Signer, ProjectMembershipRole.Member, ResourceMembershipRole.Operator]
    ])(
      "should match on a %s for a project %s with resource role %s",
      async (resourceType, projectRole, resourceRole) => {
        // Setup
        const tenant = await h.newTenant({ projectType: ProjectType.CertificateManager });
        const user = await newUserInOrg(tenant.org.id);
        await h.factories.projectMembership({
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          userId: user.id,
          role: projectRole
        });
        // Applications and signers are only ids to their memberships.
        const resourceId = crypto.randomUUID();
        if (resourceRole) {
          await insertMembership({
            scope: RESOURCE_SCOPE,
            orgId: tenant.org.id,
            projectId: tenant.project.id,
            resource: { type: resourceType, id: resourceId },
            actor: { userId: user.id },
            roles: [{ role: resourceRole }]
          });
        }

        // Action and assert
        await compareResource({
          principal: userPrincipal(user),
          orgId: tenant.org.id,
          projectId: tenant.project.id,
          resourceType,
          resourceId
        });
      }
    );

    test("should give a delegated OAuth token nothing on an application, like legacy", async () => {
      // Setup
      const tenant = await h.newTenant({ projectType: ProjectType.CertificateManager });
      requestStore.values[RequestContextKey.OauthScopes] = ["secrets:read"];

      // Action and assert
      await compareResource({
        principal: userPrincipal(tenant.admin, {
          oauth: { clientId: "client", scopes: ["secrets:read"] }
        } as Partial<TPrincipal>),
        orgId: tenant.org.id,
        projectId: tenant.project.id,
        resourceType: ResourceType.CertificateApplication,
        resourceId: crypto.randomUUID()
      });
    });
  });
});
