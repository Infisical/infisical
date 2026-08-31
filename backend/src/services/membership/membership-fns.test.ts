import { resolveMembershipRoleSlugs } from "./membership-fns";

describe("resolveMembershipRoleSlugs", () => {
  test("prefers the custom role slug over the built-in role column", () => {
    expect(resolveMembershipRoleSlugs([{ role: "custom", customRoleSlug: "release-manager" }])).toEqual([
      "release-manager"
    ]);
  });

  test("falls back to the role column when there is no custom slug", () => {
    expect(resolveMembershipRoleSlugs([{ role: "admin" }, { role: "member", customRoleSlug: null }])).toEqual([
      "admin",
      "member"
    ]);
  });

  test("drops no-access, which confers nothing", () => {
    expect(resolveMembershipRoleSlugs([{ role: "no-access" }, { role: "admin" }])).toEqual(["admin"]);
  });

  test("drops expired temporary roles so a boundary check cannot over-block", () => {
    const expired = { role: "admin", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) };
    const live = { role: "member", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() + 60_000) };

    expect(resolveMembershipRoleSlugs([expired, live])).toEqual(["member"]);
  });

  test("keeps permanent roles regardless of temporaryAccessEndTime", () => {
    expect(
      resolveMembershipRoleSlugs([{ role: "admin", isTemporary: false, temporaryAccessEndTime: new Date(0) }])
    ).toEqual(["admin"]);
  });

  test("returns an empty list when every role filters out", () => {
    expect(
      resolveMembershipRoleSlugs([
        { role: "no-access" },
        { role: "admin", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 1) }
      ])
    ).toEqual([]);
  });
});
