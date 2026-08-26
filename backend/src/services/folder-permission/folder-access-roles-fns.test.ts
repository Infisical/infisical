import { MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType, TAdditionalPrivileges } from "@app/db/schemas";
import { FOLDER_SCOPED_DENY_RULES } from "@app/ee/services/permission/folder-roles";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

import {
  buildFolderAccessRoster,
  BUILT_IN_PROJECT_ROLE_NAMES,
  collectDistinctRoles,
  FOLDER_ACCESS_PROBES,
  matchesSearch,
  paginateRoster,
  reviveFolderAccessRoster,
  roleGrantsFolderAccess,
  sortRosterEntries,
  splitFolderAccessRoster,
  TDistinctProjectRole,
  toCachedRosterRole
} from "./folder-access-roles-fns";
import { TCachedFolderAccessRoster, TCachedRosterRole, TRosterRoleRow, TRosterUser } from "./folder-permission-types";

const folder = { environmentSlug: "dev", path: "/team/app" };
const now = new Date("2026-08-25T12:00:00.000Z");
const past = new Date("2026-08-25T11:00:00.000Z");
const future = new Date("2026-08-25T13:00:00.000Z");

const pack = (rules: RawRuleOf<MongoAbility>[]) => packRules(rules);

const builtIn = (slug: string): TDistinctProjectRole => ({ key: slug, slug, isCustom: false });
const custom = (permissions: unknown): TDistinctProjectRole => ({
  key: "custom-role-id",
  slug: "custom-role",
  isCustom: true,
  permissions
});

const roleRow = (overrides: Partial<TRosterRoleRow> = {}): TRosterRoleRow => ({
  membershipRoleId: "membership-role-id",
  role: ProjectMembershipRole.Member,
  customRoleId: null,
  customRoleSlug: null,
  customRoleName: null,
  customRolePermissions: null,
  isTemporary: false,
  temporaryAccessEndTime: null,
  ...overrides
});

const customRoleRow = (overrides: Partial<TRosterRoleRow> = {}): TRosterRoleRow =>
  roleRow({
    membershipRoleId: "custom-membership-role-id",
    role: ProjectMembershipRole.Custom,
    customRoleId: "custom-role-id",
    customRoleSlug: "custom-role",
    customRoleName: "Custom Role",
    customRolePermissions: [],
    ...overrides
  });

const cachedRole = (overrides: Partial<TCachedRosterRole> = {}): TCachedRosterRole => ({
  id: null,
  slug: ProjectMembershipRole.Member,
  name: "Member",
  isTemporary: false,
  temporaryAccessEndTime: null,
  ...overrides
});

const user = (userId: string, membershipId: string | null = `${userId}-membership`): TRosterUser => ({
  userId,
  username: `${userId}@example.com`,
  email: `${userId}@example.com`,
  firstName: null,
  lastName: null,
  membershipId
});

const grant = { id: "grant-id" } as TAdditionalPrivileges;

describe("FOLDER_ACCESS_PROBES", () => {
  test("covers every deny-list pair", () => {
    const denied = FOLDER_SCOPED_DENY_RULES.flatMap((rule) => {
      const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      return subjects.flatMap((sub) => actions.map((action) => ({ action, subject: sub })));
    });

    expect(FOLDER_ACCESS_PROBES).toEqual(denied);
    expect(new Set(FOLDER_ACCESS_PROBES.map((probe) => probe.subject))).toEqual(
      new Set([
        ProjectPermissionSub.Secrets,
        ProjectPermissionSub.SecretFolders,
        ProjectPermissionSub.SecretImports,
        ProjectPermissionSub.DynamicSecrets,
        ProjectPermissionSub.SecretSyncs,
        ProjectPermissionSub.SecretRotation,
        ProjectPermissionSub.SecretEventSubscriptions,
        ProjectPermissionSub.HoneyTokens,
        ProjectPermissionSub.Commits
      ])
    );
  });
});

describe("roleGrantsFolderAccess", () => {
  test.each([ProjectMembershipRole.Admin, ProjectMembershipRole.Member, ProjectMembershipRole.Viewer])(
    "built-in %s grants access",
    (slug) => {
      expect(roleGrantsFolderAccess(builtIn(slug), folder)).toBe(true);
    }
  );

  test("no-access grants nothing", () => {
    expect(roleGrantsFolderAccess(builtIn(ProjectMembershipRole.NoAccess), folder)).toBe(false);
  });

  test("custom role scoped by environment and secretPath glob grants access only under that path", () => {
    const role = custom(
      pack([
        {
          action: ProjectPermissionSecretActions.ReadValue,
          subject: ProjectPermissionSub.Secrets,
          conditions: { environment: "dev", secretPath: { $glob: "/team/**" } }
        }
      ])
    );

    expect(roleGrantsFolderAccess(role, folder)).toBe(true);
    expect(roleGrantsFolderAccess(role, { environmentSlug: "dev", path: "/other" })).toBe(false);
    expect(roleGrantsFolderAccess(role, { environmentSlug: "prod", path: "/team/app" })).toBe(false);
  });

  test("custom role granting only non-folder subjects grants nothing", () => {
    const role = custom(pack([{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Member }]));
    expect(roleGrantsFolderAccess(role, folder)).toBe(false);
  });

  test("custom role with only SecretFolders.Read grants nothing", () => {
    const role = custom(pack([{ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretFolders }]));
    expect(roleGrantsFolderAccess(role, folder)).toBe(false);
  });

  test("inverted rules grant nothing", () => {
    const role = custom(
      pack([
        { action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets, inverted: true }
      ])
    );
    expect(roleGrantsFolderAccess(role, folder)).toBe(false);
  });
});

describe("BUILT_IN_PROJECT_ROLE_NAMES", () => {
  test("matches the predefined role names", () => {
    [ProjectType.SecretManager, ProjectType.KMS].forEach((projectType) => {
      getPredefinedRoles({ projectId: "project-id", projectType }).forEach(({ slug, name }) => {
        expect(BUILT_IN_PROJECT_ROLE_NAMES[slug]).toBe(name);
      });
    });
  });
});

describe("collectDistinctRoles", () => {
  test("keys built-ins by slug and custom roles by id, once each", () => {
    const roles = collectDistinctRoles([
      { roles: [roleRow(), customRoleRow({ customRolePermissions: ["packed"] })] },
      { roles: [roleRow({ membershipRoleId: "other" }), customRoleRow({ membershipRoleId: "other-custom" })] }
    ]);

    expect(roles).toEqual([
      { key: ProjectMembershipRole.Member, slug: ProjectMembershipRole.Member, isCustom: false },
      { key: "custom-role-id", slug: "custom-role", isCustom: true, permissions: ["packed"] }
    ]);
  });

  test("skips custom rows whose role row is missing", () => {
    expect(collectDistinctRoles([{ roles: [customRoleRow({ customRoleId: null, customRoleSlug: null })] }])).toEqual(
      []
    );
  });
});

describe("toCachedRosterRole", () => {
  test("maps a built-in role to a null id and its display name", () => {
    expect(toCachedRosterRole(roleRow({ role: ProjectMembershipRole.NoAccess }))).toEqual({
      id: null,
      slug: ProjectMembershipRole.NoAccess,
      name: "No Access",
      isTemporary: false,
      temporaryAccessEndTime: null
    });
  });

  test("maps a custom role to its row id, slug and name", () => {
    expect(toCachedRosterRole(customRoleRow({ isTemporary: true, temporaryAccessEndTime: future }))).toEqual({
      id: "custom-role-id",
      slug: "custom-role",
      name: "Custom Role",
      isTemporary: true,
      temporaryAccessEndTime: future
    });
  });

  test("drops a custom role whose row no longer exists", () => {
    expect(toCachedRosterRole(customRoleRow({ customRoleName: null }))).toBeNull();
  });
});

describe("buildFolderAccessRoster", () => {
  test("records the granting role keys and the display roles without permissions", () => {
    const roster = buildFolderAccessRoster(
      [
        { actor: user("member"), roles: [roleRow()] },
        { actor: user("locked"), roles: [roleRow({ role: ProjectMembershipRole.NoAccess })] }
      ],
      folder
    );

    expect(roster.grantingRoleKeys).toEqual([ProjectMembershipRole.Member]);
    expect(roster.actors).toEqual([
      { actor: user("member"), roles: [cachedRole()] },
      { actor: user("locked"), roles: [cachedRole({ slug: ProjectMembershipRole.NoAccess, name: "No Access" })] }
    ]);
    expect(JSON.stringify(roster)).not.toContain("permissions");
  });
});

describe("reviveFolderAccessRoster", () => {
  test("restores temporaryAccessEndTime dates after a JSON round trip", () => {
    const roster: TCachedFolderAccessRoster<TRosterUser> = {
      grantingRoleKeys: [],
      actors: [{ actor: user("u"), roles: [cachedRole({ isTemporary: true, temporaryAccessEndTime: future })] }]
    };

    const revived = reviveFolderAccessRoster(JSON.parse(JSON.stringify(roster)) as typeof roster);
    expect(revived.actors[0].roles[0].temporaryAccessEndTime).toEqual(future);
  });
});

describe("splitFolderAccessRoster", () => {
  const split = (roster: TCachedFolderAccessRoster<TRosterUser>, grants: [string, TAdditionalPrivileges][] = []) =>
    splitFolderAccessRoster({
      roster,
      grantByActorId: new Map(grants),
      actorIdOf: (actor) => actor.userId,
      now
    });

  test("puts actors with a granting role in the with-access list with only those roles", () => {
    const roles = [cachedRole(), cachedRole({ slug: ProjectMembershipRole.NoAccess, name: "No Access" })];
    const { withAccess, withoutAccess } = split({
      grantingRoleKeys: [ProjectMembershipRole.Member],
      actors: [{ actor: user("u"), roles }]
    });

    expect(withoutAccess).toEqual([]);
    expect(withAccess).toEqual([
      {
        actor: user("u"),
        membership: {
          id: "u-membership",
          isProjectAdmin: false,
          roles: [{ id: null, slug: ProjectMembershipRole.Member, name: "Member" }]
        },
        grant: null
      }
    ]);
  });

  test("lists every active role for actors without access", () => {
    const { withAccess, withoutAccess } = split({
      grantingRoleKeys: [],
      actors: [
        {
          actor: user("u", null),
          roles: [
            cachedRole({ slug: ProjectMembershipRole.NoAccess, name: "No Access" }),
            cachedRole({ id: "custom-role-id", slug: "custom-role", name: "Custom Role" })
          ]
        }
      ]
    });

    expect(withAccess).toEqual([]);
    expect(withoutAccess).toEqual([
      {
        actor: user("u", null),
        membership: {
          id: null,
          isProjectAdmin: false,
          roles: [
            { id: null, slug: ProjectMembershipRole.NoAccess, name: "No Access" },
            { id: "custom-role-id", slug: "custom-role", name: "Custom Role" }
          ]
        },
        grant: null
      }
    ]);
  });

  test("keeps an actor with a folder grant but no granting role in the with-access list", () => {
    const { withAccess, withoutAccess } = split(
      {
        grantingRoleKeys: [],
        actors: [{ actor: user("u"), roles: [cachedRole({ slug: ProjectMembershipRole.NoAccess, name: "No Access" })] }]
      },
      [["u", grant]]
    );

    expect(withoutAccess).toEqual([]);
    expect(withAccess).toEqual([
      { actor: user("u"), membership: { id: "u-membership", isProjectAdmin: false, roles: [] }, grant }
    ]);
  });

  test("ignores expired temporary roles", () => {
    const { withAccess, withoutAccess } = split({
      grantingRoleKeys: [ProjectMembershipRole.Member],
      actors: [
        {
          actor: user("u"),
          roles: [
            cachedRole({ isTemporary: true, temporaryAccessEndTime: past }),
            cachedRole({ slug: ProjectMembershipRole.NoAccess, name: "No Access" })
          ]
        }
      ]
    });

    expect(withAccess).toEqual([]);
    expect(withoutAccess[0].membership.roles).toEqual([
      { id: null, slug: ProjectMembershipRole.NoAccess, name: "No Access" }
    ]);
  });

  test("flags actors holding an active built-in admin role and keeps them in the with-access list", () => {
    const { withAccess, withoutAccess } = split({
      grantingRoleKeys: [ProjectMembershipRole.Admin, ProjectMembershipRole.Member, "custom-role-id"],
      actors: [
        { actor: user("admin"), roles: [cachedRole({ slug: ProjectMembershipRole.Admin, name: "Admin" })] },
        {
          actor: user("former-admin"),
          roles: [
            cachedRole({
              slug: ProjectMembershipRole.Admin,
              name: "Admin",
              isTemporary: true,
              temporaryAccessEndTime: past
            }),
            cachedRole()
          ]
        },
        {
          actor: user("custom-admin"),
          roles: [cachedRole({ id: "custom-role-id", slug: ProjectMembershipRole.Admin, name: "Admin" })]
        }
      ]
    });

    expect(withoutAccess).toEqual([]);
    expect(withAccess.map((entry) => entry.actor.userId)).toEqual(["admin", "former-admin", "custom-admin"]);
    // only a currently active built-in admin is one: an expired temporary admin and a custom role
    // slugged "admin" are ordinary grantees
    expect(withAccess).toMatchObject([
      { membership: { isProjectAdmin: true } },
      { membership: { isProjectAdmin: false } },
      { membership: { isProjectAdmin: false } }
    ]);
  });

  test("keeps an admin out of the without-access list even when no role grants folder access", () => {
    const { withAccess, withoutAccess } = split({
      grantingRoleKeys: [],
      actors: [{ actor: user("admin"), roles: [cachedRole({ slug: ProjectMembershipRole.Admin, name: "Admin" })] }]
    });

    expect(withoutAccess).toEqual([]);
    expect(withAccess).toEqual([
      { actor: user("admin"), membership: { id: "admin-membership", isProjectAdmin: true, roles: [] }, grant: null }
    ]);
  });

  test("dedupes the same role reached directly and through a group", () => {
    const { withAccess } = split({
      grantingRoleKeys: [ProjectMembershipRole.Member],
      actors: [{ actor: user("u"), roles: [cachedRole(), cachedRole()] }]
    });

    expect(withAccess[0].membership.roles).toHaveLength(1);
  });
});

describe("matchesSearch", () => {
  test("matches case-insensitively across any field and skips empty fields", () => {
    expect(matchesSearch("ALICE", [null, "alice@example.com"])).toBe(true);
    expect(matchesSearch("bob", ["alice", null, undefined])).toBe(false);
    expect(matchesSearch(undefined, [])).toBe(true);
  });
});

describe("sortRosterEntries", () => {
  test("orders by the lower-cased name and then by the tie-break", () => {
    const sorted = sortRosterEntries(
      [
        { name: "bob", id: "2" },
        { name: "Alice", id: "9" },
        { name: "alice", id: "1" }
      ],
      (entry) => [entry.name, entry.id]
    );

    expect(sorted.map((entry) => entry.id)).toEqual(["1", "9", "2"]);
  });
});

describe("paginateRoster", () => {
  test("slices the page and reports the full count", () => {
    expect(paginateRoster([1, 2, 3, 4, 5], 1, 2)).toEqual({ items: [2, 3], totalCount: 5 });
    expect(paginateRoster([1, 2, 3], 10, 2)).toEqual({ items: [], totalCount: 3 });
  });
});
