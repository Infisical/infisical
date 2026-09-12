import { packRules } from "@casl/ability/extra";
import { vi } from "vitest";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";

import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "./org-permission";
import { permissionServiceFactory } from "./permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "./project-permission";

// Privilege boundaries compare the actor against every grant the target holds. An additional
// privilege carries a raw permission blob and no role slug, so a resolver that walked only
// `membership.roles` would leave it out and clear an actor that out-ranks the target's roles but
// not its grants. Group-inherited roles ride in on the same query, as ordinary membership rows.

const ELEVATED_PRIVILEGE = packRules([
  { subject: OrgPermissionSubjects.Identity, action: [OrgPermissionIdentityActions.EditAuth] }
]);

const createService = (memberships: unknown[], customRoles: unknown[] = []) => {
  const permissionDAL = { getPermission: vi.fn().mockResolvedValue(memberships) };

  const service = permissionServiceFactory({
    permissionDAL,
    roleDAL: { find: vi.fn().mockResolvedValue(customRoles) },
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", type: ProjectType.SecretManager }) },
    serviceTokenDAL: {} as never,
    keyStore: {} as never,
    userDAL: {} as never,
    identityDAL: { findById: vi.fn().mockResolvedValue({ id: "identity-1", name: "target-identity" }) },
    additionalPrivilegeDAL: {} as never,
    groupDAL: {} as never,
    secretFolderDAL: {} as never
  } as never);

  return { service, permissionDAL };
};

const orgScope = { scope: AccessScope.Organization, orgId: "org-1" } as const;
const projectScope = { scope: AccessScope.Project, orgId: "org-1", projectId: "project-1" } as const;

const secretReadConditions = (grants: { permission: { rules: { conditions?: unknown }[] } }[]) =>
  grants.flatMap((grant) => grant.permission.rules.map((rule) => rule.conditions).filter(Boolean));

describe("getActorGrantAbilities", () => {
  test("returns one ability per role the target holds", async () => {
    const { service } = createService([
      { roles: [{ role: OrgMembershipRole.Member }, { role: OrgMembershipRole.Admin }], additionalPrivileges: [] }
    ]);

    const grants = await service.getActorGrantAbilities({
      scopeData: orgScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(grants).toHaveLength(2);
  });

  test("a role inherited through a group is returned like a direct one", async () => {
    const { service, permissionDAL } = createService([
      { actorIdentityId: "identity-1", roles: [{ role: OrgMembershipRole.Member }], additionalPrivileges: [] },
      { actorGroupId: "group-1", roles: [{ role: OrgMembershipRole.Admin }], additionalPrivileges: [] }
    ]);

    const grants = await service.getActorGrantAbilities({
      scopeData: orgScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(grants).toHaveLength(2);
    expect(permissionDAL.getPermission).toHaveBeenCalledWith({
      scopeData: orgScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });
  });

  test("an additional privilege is returned as its own ability", async () => {
    const { service } = createService([
      {
        roles: [{ role: OrgMembershipRole.Member }],
        additionalPrivileges: [{ permissions: ELEVATED_PRIVILEGE }]
      }
    ]);

    const grants = await service.getActorGrantAbilities({
      scopeData: orgScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(grants).toHaveLength(2);
    expect(
      grants.some((grant) =>
        grant.permission.can(OrgPermissionIdentityActions.EditAuth, OrgPermissionSubjects.Identity)
      )
    ).toBe(true);
  });

  test("an expired additional privilege is left out", async () => {
    const { service } = createService([
      {
        roles: [{ role: OrgMembershipRole.Member }],
        additionalPrivileges: [
          {
            permissions: ELEVATED_PRIVILEGE,
            isTemporary: true,
            temporaryAccessEndTime: new Date(Date.now() - 1000)
          }
        ]
      }
    ]);

    const grants = await service.getActorGrantAbilities({
      scopeData: orgScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(grants).toHaveLength(1);
  });
});

// The boundary these grants feed measures them against a caller whose own rules getProjectPermission
// already rendered. A target left on its raw template is compared as the literal string
// "{{identity.id}}", so two principals holding the very same role read as unrelated and the caller is
// refused. `identity.auth` is the one context that stays raw: it lives on the credential the target
// authenticates with, and rendering it against nothing would empty the condition out.

const TEAM_SCOPED_READ = packRules([
  {
    subject: ProjectPermissionSub.Secrets,
    action: [ProjectPermissionActions.Read],
    conditions: { secretPath: { $glob: "/{{identity.metadata.team}}/**" }, environment: "{{identity.username}}" }
  }
]);

const AUTH_SCOPED_READ = packRules([
  {
    subject: ProjectPermissionSub.Secrets,
    action: [ProjectPermissionActions.Read],
    conditions: { secretPath: { $glob: "/{{identity.auth.kubernetes.namespace}}/**" } }
  }
]);

describe("getActorGrantAbilities identity templates", () => {
  test("a role's templates are rendered from the target's own context", async () => {
    const { service } = createService(
      [
        {
          roles: [{ role: ProjectMembershipRole.Custom, customRoleSlug: "team-scoped" }],
          additionalPrivileges: [],
          metadata: [{ id: "m1", key: "team", value: "backend" }]
        }
      ],
      [{ slug: "team-scoped", name: "team-scoped", permissions: TEAM_SCOPED_READ }]
    );

    const grants = await service.getActorGrantAbilities({
      scopeData: projectScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(secretReadConditions(grants)).toContainEqual({
      secretPath: { $glob: "/backend/**" },
      environment: "target-identity"
    });
  });

  test("an additional privilege's templates are rendered too", async () => {
    const { service } = createService([
      {
        roles: [],
        additionalPrivileges: [{ permissions: TEAM_SCOPED_READ }],
        metadata: [{ id: "m1", key: "team", value: "backend" }]
      }
    ]);

    const grants = await service.getActorGrantAbilities({
      scopeData: projectScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(secretReadConditions(grants)).toContainEqual({
      secretPath: { $glob: "/backend/**" },
      environment: "target-identity"
    });
  });

  test("a metadata key the target does not carry stays a template", async () => {
    const { service } = createService(
      [{ roles: [{ role: ProjectMembershipRole.Custom, customRoleSlug: "team-scoped" }], additionalPrivileges: [] }],
      [{ slug: "team-scoped", name: "team-scoped", permissions: TEAM_SCOPED_READ }]
    );

    const grants = await service.getActorGrantAbilities({
      scopeData: projectScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(secretReadConditions(grants)).toContainEqual({
      secretPath: { $glob: "/{{identity.metadata.team}}/**" },
      environment: "target-identity"
    });
  });

  test("an identity.auth template is left unrendered", async () => {
    const { service } = createService(
      [{ roles: [{ role: ProjectMembershipRole.Custom, customRoleSlug: "auth-scoped" }], additionalPrivileges: [] }],
      [{ slug: "auth-scoped", name: "auth-scoped", permissions: AUTH_SCOPED_READ }]
    );

    const grants = await service.getActorGrantAbilities({
      scopeData: projectScope,
      actorId: "identity-1",
      actorType: ActorType.IDENTITY
    });

    expect(secretReadConditions(grants)).toContainEqual({
      secretPath: { $glob: "/{{identity.auth.kubernetes.namespace}}/**" }
    });
  });
});
