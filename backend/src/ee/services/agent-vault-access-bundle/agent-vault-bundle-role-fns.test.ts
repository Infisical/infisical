import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";

import { giveBundleRole } from "./agent-vault-bundle-role-fns";

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
