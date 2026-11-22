import { Knex } from "knex";
import { vi } from "vitest";

import { TMemberships } from "@app/db/schemas";

import { assertUserStillActiveInOrg } from "./pam-session-access-fns";

describe("assertUserStillActiveInOrg", () => {
  const tx = {} as Knex;

  const build = ({
    rows,
    groupAccessOrgIds = []
  }: {
    rows: Record<string, { isActive: boolean } | undefined>;
    groupAccessOrgIds?: string[];
  }) => {
    const membershipDAL = {
      lockOrgMembershipForUser: vi.fn(async (orgId: string) => rows[orgId] as TMemberships | undefined)
    };
    const orgDAL = {
      findById: vi.fn().mockResolvedValue({ id: "sub-org", rootOrgId: "root-org" }),
      lockActorsForOrgAccess: vi.fn().mockResolvedValue(undefined),
      findActorsWithActiveOrgAccess: vi.fn(async ({ orgId, userIds }: { orgId: string; userIds: string[] }) => ({
        userIds: new Set(groupAccessOrgIds.includes(orgId) ? userIds : []),
        identityIds: new Set<string>()
      }))
    };
    const run = () =>
      assertUserStillActiveInOrg({
        orgId: "sub-org",
        userId: "user-1",
        membershipDAL,
        orgDAL: orgDAL as unknown as Parameters<typeof assertUserStillActiveInOrg>[0]["orgDAL"],
        tx
      });
    return { run, orgDAL };
  };

  test("passes on active rows of their own without taking the actor lock", async () => {
    const { run, orgDAL } = build({ rows: { "sub-org": { isActive: true }, "root-org": { isActive: true } } });
    await expect(run()).resolves.toBeUndefined();
    expect(orgDAL.lockActorsForOrgAccess).not.toHaveBeenCalled();
  });

  test("refuses a deactivated row even when a group would reach the org", async () => {
    const { run } = build({
      rows: { "sub-org": { isActive: false }, "root-org": { isActive: true } },
      groupAccessOrgIds: ["sub-org"]
    });
    await expect(run()).rejects.toThrow("no longer active");
  });

  test("passes a user who reaches the sub-org only through a group, under the actor lock", async () => {
    const { run, orgDAL } = build({ rows: { "root-org": { isActive: true } }, groupAccessOrgIds: ["sub-org"] });
    await expect(run()).resolves.toBeUndefined();
    expect(orgDAL.lockActorsForOrgAccess).toHaveBeenCalledWith({ orgId: "sub-org", actorIds: ["user-1"] }, tx);
    expect(orgDAL.lockActorsForOrgAccess.mock.invocationCallOrder[0]).toBeLessThan(
      orgDAL.findActorsWithActiveOrgAccess.mock.invocationCallOrder[0]
    );
  });

  test("refuses a user with no row and no group path", async () => {
    const { run } = build({ rows: { "root-org": { isActive: true } } });
    await expect(run()).rejects.toThrow("no longer active");
  });
});
