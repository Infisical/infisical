import { describe, expect, test } from "vitest";

import { resolveOidcGroupMembershipChanges } from "./oidc-config-fns";

const makeGroup = (id: string, name: string) => ({ id, name });
const makeMembership = (groupId: string, groupName: string) => ({ groupId, groupName });

describe("resolveOidcGroupMembershipChanges", () => {
  test("matches IdP group claims to org groups case-insensitively when adding", () => {
    const { groupsToAddUserTo, groupsToRemoveUserFrom } = resolveOidcGroupMembershipChanges({
      idpGroups: ["engineering", "DESIGN"],
      userGroupMemberships: [],
      orgGroups: [makeGroup("1", "Engineering"), makeGroup("2", "Design"), makeGroup("3", "Sales")]
    });

    expect(groupsToAddUserTo.map((g) => g.name).sort()).toEqual(["Design", "Engineering"]);
    expect(groupsToRemoveUserFrom).toEqual([]);
  });

  test("does not re-add a group the user already belongs to (case-insensitive)", () => {
    const { groupsToAddUserTo, groupsToRemoveUserFrom } = resolveOidcGroupMembershipChanges({
      idpGroups: ["ENGINEERING"],
      userGroupMemberships: [makeMembership("1", "Engineering")],
      orgGroups: [makeGroup("1", "Engineering")]
    });

    expect(groupsToAddUserTo).toEqual([]);
    expect(groupsToRemoveUserFrom).toEqual([]);
  });

  test("removes the user from groups no longer present in the claim (case-insensitive)", () => {
    const { groupsToAddUserTo, groupsToRemoveUserFrom } = resolveOidcGroupMembershipChanges({
      idpGroups: ["design"],
      userGroupMemberships: [makeMembership("1", "Engineering"), makeMembership("2", "Design")],
      orgGroups: [makeGroup("1", "Engineering"), makeGroup("2", "Design")]
    });

    expect(groupsToAddUserTo).toEqual([]);
    expect(groupsToRemoveUserFrom.map((g) => g.name)).toEqual(["Engineering"]);
  });

  test("adds the user to every case-variant when the org has groups differing only by case", () => {
    const { groupsToAddUserTo } = resolveOidcGroupMembershipChanges({
      idpGroups: ["engineering"],
      userGroupMemberships: [],
      orgGroups: [makeGroup("1", "Engineering"), makeGroup("2", "engineering")]
    });

    expect(groupsToAddUserTo.map((g) => g.id).sort()).toEqual(["1", "2"]);
  });

  test("adds the user to a case-variant they have not joined even when already in another variant", () => {
    // User is in "Engineering" (id 1) but not "engineering" (id 2). A name-based "already member"
    // check would wrongly skip id 2; keying on group ID adds them to the variant they actually lack.
    const { groupsToAddUserTo } = resolveOidcGroupMembershipChanges({
      idpGroups: ["engineering"],
      userGroupMemberships: [makeMembership("1", "Engineering")],
      orgGroups: [makeGroup("1", "Engineering"), makeGroup("2", "engineering")]
    });

    expect(groupsToAddUserTo.map((g) => g.id)).toEqual(["2"]);
  });

  test("only removes groups the user is actually a member of, even when a case-variant exists", () => {
    // The user is a member of "Engineering" (id 1); a case-variant "engineering" (id 2) also exists
    // but the user never joined it, so it must not be queued for removal.
    const { groupsToRemoveUserFrom } = resolveOidcGroupMembershipChanges({
      idpGroups: [],
      userGroupMemberships: [makeMembership("1", "Engineering")],
      orgGroups: [makeGroup("1", "Engineering"), makeGroup("2", "engineering")]
    });

    expect(groupsToRemoveUserFrom.map((g) => g.id)).toEqual(["1"]);
  });
});
