import { packRules } from "@casl/ability/extra";
import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { slugSchema } from "@app/server/lib/schemas";

import {
  anyActorHoldsAdmin,
  bundleRolePermissions,
  ensureBundleRole,
  giveBundleRole,
  hasOnlyBundleRoleRules,
  heldRolesOf,
  renameBundleRole,
  takeBundleRole,
  takeBundleRoleFromEveryone
} from "./agent-vault-bundle-role-fns";

const PROJECT_ID = "project-1";
const ROLE_ID = "role-bundle";
const tx = {} as Knex;

const build = (rows: Record<string, unknown>[]) => {
  const deps = {
    membershipDAL: {
      find: vi.fn(async ({ $in }: { $in: Record<string, string[]> }) =>
        ($in.actorUserId ?? []).map((actorUserId) => ({ id: `membership-${actorUserId}`, actorUserId }))
      )
    },
    membershipRoleDAL: {
      find: vi.fn().mockResolvedValue(rows),
      delete: vi.fn().mockResolvedValue([]),
      insertMany: vi.fn().mockResolvedValue([])
    }
  };
  const give = (actorIds: string[]) =>
    giveBundleRole(
      deps as unknown as Parameters<typeof giveBundleRole>[0],
      {
        projectId: PROJECT_ID,
        roleId: ROLE_ID,
        actors: actorIds.map((actorId) => ({ actorColumn: "actorUserId" as const, actorId }))
      },
      tx
    );
  return { deps, give };
};

const bundleRoleRow = (membershipId: string, extra: Record<string, unknown> = {}) => ({
  id: `row-${membershipId}`,
  membershipId,
  role: ProjectMembershipRole.Custom,
  customRoleId: ROLE_ID,
  isTemporary: false,
  ...extra
});

describe("giveBundleRole", () => {
  test("skips a member who holds the role and gives it afresh to one whose time limit on it has ended", async () => {
    const { deps, give } = build([
      bundleRoleRow("membership-user-live"),
      bundleRoleRow("membership-user-ended", {
        isTemporary: true,
        temporaryAccessEndTime: new Date(Date.now() - 60_000)
      })
    ]);

    const { added, skipped } = await give(["user-live", "user-ended"]);

    expect(skipped).toEqual([{ actorColumn: "actorUserId", actorId: "user-live" }]);
    expect(added).toEqual([{ actorColumn: "actorUserId", actorId: "user-ended" }]);
    expect(deps.membershipRoleDAL.delete).toHaveBeenCalledWith(
      { customRoleId: ROLE_ID, $in: { membershipId: ["membership-user-ended"] } },
      tx
    );
    expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: "membership-user-ended", role: ProjectMembershipRole.Custom, customRoleId: ROLE_ID }],
      tx
    );
  });

  test("leaves out a member who already holds the most roles a member can", async () => {
    const { deps, give } = build(
      Array.from({ length: 10 }, (_, index) => ({
        id: `row-${index}`,
        membershipId: "membership-user-full",
        role: ProjectMembershipRole.Custom,
        customRoleId: `role-${index}`,
        isTemporary: false
      }))
    );

    const { added, full } = await give(["user-full"]);

    expect(added).toEqual([]);
    expect(full).toEqual([{ actorColumn: "actorUserId", actorId: "user-full" }]);
    expect(deps.membershipRoleDAL.insertMany).not.toHaveBeenCalled();
  });
});

const ENDED = { isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) };

describe("ensureBundleRole", () => {
  const ensure = async (name: string, takenSlugs: string[] = []) => {
    const roleDAL = {
      find: vi.fn().mockResolvedValue(takenSlugs.map((slug) => ({ slug }))),
      findById: vi.fn(),
      create: vi.fn(async (columns: { slug: string }) => ({ id: "role-new", ...columns }))
    };
    const agentVaultAccessBundleDAL = { updateById: vi.fn() };
    await ensureBundleRole(
      { roleDAL, agentVaultAccessBundleDAL } as unknown as Parameters<typeof ensureBundleRole>[0],
      { id: "bundle-1", name, projectId: PROJECT_ID, grantRoleId: null },
      tx
    );
    return (roleDAL.create.mock.calls[0][0] as { slug: string }).slug;
  };

  test("makes a slug the slug rules accept from a name cut just after a hyphen", async () => {
    const name = `${"a".repeat(57)}-bbbbbb`;
    const slug = await ensure(name);
    expect(slug).toBe(`${"a".repeat(57)}-users`);
    expect(slugSchema().safeParse(slug).success).toBe(true);

    const suffixed = await ensure(name, [slug]);
    expect(suffixed.length).toBeLessThanOrEqual(64);
    expect(slugSchema().safeParse(suffixed).success).toBe(true);
  });
});

describe("ended time-limited roles", () => {
  test("an Admin role that has ended doesn't count as held", async () => {
    const membershipRoleDAL = {
      find: vi
        .fn()
        .mockResolvedValue([{ membershipId: "membership-user-1", role: ProjectMembershipRole.Admin, ...ENDED }])
    };
    const membershipDAL = {
      find: vi.fn().mockResolvedValue([{ id: "membership-user-1", actorUserId: "user-1" }])
    };
    const holdsAdmin = await anyActorHoldsAdmin(
      { membershipDAL, membershipRoleDAL } as unknown as Parameters<typeof anyActorHoldsAdmin>[0],
      { projectId: PROJECT_ID, actors: [{ actorColumn: "actorUserId", actorId: "user-1" }] },
      tx
    );
    expect(holdsAdmin).toBe(false);
  });

  test("taking the role from a member whose other role has ended leaves them No Access", async () => {
    const { deps } = build([
      bundleRoleRow("membership-user-1"),
      {
        id: "row-ended",
        membershipId: "membership-user-1",
        role: ProjectMembershipRole.Custom,
        customRoleId: "role-other",
        ...ENDED
      },
      bundleRoleRow("membership-user-2"),
      {
        id: "row-live",
        membershipId: "membership-user-2",
        role: ProjectMembershipRole.Custom,
        customRoleId: "role-other",
        isTemporary: false
      }
    ]);

    const { removed } = await takeBundleRole(
      deps as unknown as Parameters<typeof takeBundleRole>[0],
      {
        projectId: PROJECT_ID,
        roleId: ROLE_ID,
        actors: [
          { actorColumn: "actorUserId", actorId: "user-1" },
          { actorColumn: "actorUserId", actorId: "user-2" }
        ]
      },
      tx
    );

    expect(removed).toHaveLength(2);
    expect(deps.membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [{ membershipId: "membership-user-1", role: ProjectMembershipRole.NoAccess }],
      tx
    );
  });
});

describe("takeBundleRoleFromEveryone", () => {
  test("takes the role from every holder and gives No Access only to one left with no live role", async () => {
    const membershipRoleDAL = {
      find: vi
        .fn()
        .mockResolvedValueOnce([
          bundleRoleRow("membership-a"),
          bundleRoleRow("membership-b"),
          bundleRoleRow("membership-c")
        ])
        .mockResolvedValueOnce([
          {
            membershipId: "membership-b",
            role: ProjectMembershipRole.Custom,
            customRoleId: "role-other",
            isTemporary: false
          },
          { membershipId: "membership-c", role: ProjectMembershipRole.Custom, customRoleId: "role-other", ...ENDED }
        ]),
      delete: vi.fn().mockResolvedValue([]),
      insertMany: vi.fn().mockResolvedValue([])
    };

    await takeBundleRoleFromEveryone(
      { membershipRoleDAL } as unknown as Parameters<typeof takeBundleRoleFromEveryone>[0],
      { roleId: ROLE_ID },
      tx
    );

    expect(membershipRoleDAL.delete).toHaveBeenCalledWith({ customRoleId: ROLE_ID }, tx);
    expect(membershipRoleDAL.insertMany).toHaveBeenCalledWith(
      [
        { membershipId: "membership-a", role: ProjectMembershipRole.NoAccess },
        { membershipId: "membership-c", role: ProjectMembershipRole.NoAccess }
      ],
      tx
    );
  });

  test("does nothing when nobody holds the role", async () => {
    const membershipRoleDAL = { find: vi.fn().mockResolvedValue([]), delete: vi.fn(), insertMany: vi.fn() };
    await takeBundleRoleFromEveryone(
      { membershipRoleDAL } as unknown as Parameters<typeof takeBundleRoleFromEveryone>[0],
      { roleId: ROLE_ID },
      tx
    );
    expect(membershipRoleDAL.delete).not.toHaveBeenCalled();
    expect(membershipRoleDAL.insertMany).not.toHaveBeenCalled();
  });
});

describe("hasOnlyBundleRoleRules", () => {
  const BUNDLE_ID = "bundle-1";
  const bundleRules = (conditions: Record<string, unknown>, actions: string[][] = [["read", "use"]]) =>
    packRules(actions.map((action) => ({ action, subject: ProjectPermissionSub.AgentVaultAccessBundles, conditions })));

  test.each([
    ["as it was made", bundleRolePermissions(BUNDLE_ID)],
    ["with the id written as $eq", bundleRules({ accessBundleId: { $eq: BUNDLE_ID } })],
    ["with the id written as $in", bundleRules({ accessBundleId: { $in: [BUNDLE_ID] } })],
    ["with read and use in two rules", bundleRules({ accessBundleId: BUNDLE_ID }, [["use"], ["read"]])]
  ])("matches the rules %s", (_how, permissions) => {
    expect(hasOnlyBundleRoleRules(permissions, BUNDLE_ID)).toBe(true);
  });

  test.each([
    ["another bundle", bundleRules({ accessBundleId: { $in: [BUNDLE_ID, "bundle-2"] } })],
    ["another action", bundleRules({ accessBundleId: BUNDLE_ID }, [["read", "use", "edit"]])],
    [
      "a deny",
      packRules([
        {
          action: [
            ProjectPermissionAgentVaultAccessBundleActions.Read,
            ProjectPermissionAgentVaultAccessBundleActions.Use
          ],
          subject: ProjectPermissionSub.AgentVaultAccessBundles,
          conditions: { accessBundleId: BUNDLE_ID }
        },
        {
          action: ProjectPermissionAgentVaultAccessBundleActions.Use,
          subject: ProjectPermissionSub.AgentVaultAccessBundles,
          inverted: true
        }
      ])
    ],
    ["nothing at all", []],
    ["rules it can't read", "not rules"]
  ])("doesn't match a role changed to %s", (_change, permissions) => {
    expect(hasOnlyBundleRoleRules(permissions, BUNDLE_ID)).toBe(false);
  });
});

describe("renameBundleRole", () => {
  test("renames what still reads as made, and never the slug", async () => {
    const roleDAL = {
      findById: vi.fn().mockResolvedValue({
        id: ROLE_ID,
        slug: "deploy-users",
        name: "deploy users",
        description: "Our own description."
      }),
      updateById: vi.fn()
    };
    await renameBundleRole(
      { roleDAL } as unknown as Parameters<typeof renameBundleRole>[0],
      { roleId: ROLE_ID, previousName: "deploy", name: "release" },
      tx
    );
    expect(roleDAL.updateById).toHaveBeenCalledWith(ROLE_ID, { name: "release users" }, tx);
  });

  test("leaves a role an admin renamed alone", async () => {
    const roleDAL = {
      findById: vi.fn().mockResolvedValue({ id: ROLE_ID, slug: "deploy-users", name: "Deployers", description: null }),
      updateById: vi.fn()
    };
    await renameBundleRole(
      { roleDAL } as unknown as Parameters<typeof renameBundleRole>[0],
      { roleId: ROLE_ID, previousName: "deploy", name: "release" },
      tx
    );
    expect(roleDAL.updateById).not.toHaveBeenCalled();
  });
});

describe("heldRolesOf", () => {
  test("lists each member's live roles by slug, and none for an actor not in the project", async () => {
    const membershipDAL = {
      find: vi.fn().mockResolvedValue([{ id: "membership-user-1", actorUserId: "user-1" }])
    };
    const membershipRoleDAL = {
      findRolesByMembershipIds: vi.fn().mockResolvedValue([
        {
          membershipId: "membership-user-1",
          role: ProjectMembershipRole.Custom,
          customRoleSlug: "release",
          isTemporary: false
        },
        { membershipId: "membership-user-1", role: ProjectMembershipRole.Custom, customRoleSlug: "auditor", ...ENDED },
        {
          membershipId: "membership-user-1",
          role: ProjectMembershipRole.Custom,
          customRoleSlug: "deploy-users",
          isTemporary: false
        }
      ])
    };
    const held = await heldRolesOf(
      { membershipDAL, membershipRoleDAL } as unknown as Parameters<typeof heldRolesOf>[0],
      {
        projectId: PROJECT_ID,
        actors: [
          { actorColumn: "actorUserId", actorId: "user-1" },
          { actorColumn: "actorUserId", actorId: "user-2" }
        ]
      },
      tx
    );
    expect(held.map(({ roles }) => roles)).toEqual([["deploy-users", "release"], []]);
  });
});
