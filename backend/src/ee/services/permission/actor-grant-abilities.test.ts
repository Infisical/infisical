import { packRules } from "@casl/ability/extra";
import { vi } from "vitest";

import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";

import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "./org-permission";
import { permissionServiceFactory } from "./permission-service";

// Privilege boundaries compare the actor against every grant the target holds. An additional
// privilege carries a raw permission blob and no role slug, so a resolver that walked only
// `membership.roles` would leave it out and clear an actor that out-ranks the target's roles but
// not its grants. Group-inherited roles ride in on the same query, as ordinary membership rows.

const ELEVATED_PRIVILEGE = packRules([
  { subject: OrgPermissionSubjects.Identity, action: [OrgPermissionIdentityActions.EditAuth] }
]);

const createService = (memberships: unknown[]) => {
  const permissionDAL = { getPermission: vi.fn().mockResolvedValue(memberships) };

  const service = permissionServiceFactory({
    permissionDAL,
    roleDAL: { find: vi.fn().mockResolvedValue([]) },
    projectDAL: {} as never,
    serviceTokenDAL: {} as never,
    keyStore: {} as never,
    userDAL: {} as never,
    identityDAL: {} as never,
    additionalPrivilegeDAL: {} as never,
    groupDAL: {} as never,
    secretFolderDAL: {} as never
  } as never);

  return { service, permissionDAL };
};

const orgScope = { scope: AccessScope.Organization, orgId: "org-1" } as const;

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
