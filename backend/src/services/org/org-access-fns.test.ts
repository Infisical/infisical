import { lockAndAssertActiveOrgAccess } from "./org-access-fns";

const tx = { sentinel: true } as never;

const buildOrgDAL = (active: { userIds?: string[]; identityIds?: string[] } = {}) => {
  const calls: string[] = [];
  const orgDAL = {
    lockActorsForOrgAccess: vi.fn(async () => {
      calls.push("lock");
    }),
    findActorsWithActiveOrgAccess: vi.fn(async () => {
      calls.push("check");
      return { userIds: new Set(active.userIds ?? []), identityIds: new Set(active.identityIds ?? []) };
    })
  };
  return { orgDAL, calls };
};

describe("lockAndAssertActiveOrgAccess", () => {
  test("locks every actor before rechecking, both inside the caller's transaction", async () => {
    const { orgDAL, calls } = buildOrgDAL({ userIds: ["u1"], identityIds: ["i1"] });

    await lockAndAssertActiveOrgAccess({ orgDAL, orgId: "org", userIds: ["u1"], identityIds: ["i1"] }, tx);

    expect(calls).toEqual(["lock", "check"]);
    expect(orgDAL.lockActorsForOrgAccess).toHaveBeenCalledWith({ orgId: "org", actorIds: ["u1", "i1"] }, tx);
    expect(orgDAL.findActorsWithActiveOrgAccess).toHaveBeenCalledWith(
      { orgId: "org", userIds: ["u1"], identityIds: ["i1"] },
      tx
    );
  });

  test("refuses the grant when an actor lost their path before the lock was taken", async () => {
    const { orgDAL } = buildOrgDAL({ userIds: ["u1"] });

    await expect(lockAndAssertActiveOrgAccess({ orgDAL, orgId: "org", userIds: ["u1", "u2"] }, tx)).rejects.toThrow(
      "'u2' is no longer an active member of this organization"
    );
  });

  test("does nothing for an empty batch", async () => {
    const { orgDAL } = buildOrgDAL();

    await lockAndAssertActiveOrgAccess({ orgDAL, orgId: "org" }, tx);

    expect(orgDAL.lockActorsForOrgAccess).not.toHaveBeenCalled();
  });
});
