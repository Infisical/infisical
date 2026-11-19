import { describe, expect, it } from "vitest";

import {
  AGENT_VAULT_ADMIN_CHANGE_BLOCKED,
  assignableAgentVaultRoles,
  defaultAgentVaultRoles,
  getAgentVaultAdminChangeBlockedReason,
  holdsAgentVaultAdmin,
  isSameRoleSet,
  nextAgentVaultRoles
} from "./agentVaultMembers";

const NO_ACCESS = "no-access";
const ADMIN = "admin";

describe("nextAgentVaultRoles", () => {
  it("starts from No Access", () => {
    expect(defaultAgentVaultRoles()).toEqual([NO_ACCESS]);
  });

  it("drops No Access when another role is picked", () => {
    expect(nextAgentVaultRoles([NO_ACCESS], [NO_ACCESS, "engineers"])).toEqual(["engineers"]);
    expect(nextAgentVaultRoles([NO_ACCESS], [NO_ACCESS, ADMIN])).toEqual([ADMIN]);
  });

  it("drops every other role when No Access is picked", () => {
    expect(
      nextAgentVaultRoles(["engineers", "auditors"], ["engineers", "auditors", NO_ACCESS])
    ).toEqual([NO_ACCESS]);
  });

  it("keeps several roles together", () => {
    expect(nextAgentVaultRoles(["engineers"], ["engineers", "auditors"])).toEqual([
      "engineers",
      "auditors"
    ]);
    expect(nextAgentVaultRoles(["engineers", "auditors"], ["auditors"])).toEqual(["auditors"]);
  });

  it("falls back to No Access when every role is taken away", () => {
    expect(nextAgentVaultRoles(["engineers"], [])).toEqual([NO_ACCESS]);
    expect(nextAgentVaultRoles([NO_ACCESS], [])).toEqual([NO_ACCESS]);
  });

  it("never repeats a role", () => {
    expect(nextAgentVaultRoles(["engineers"], ["engineers", "engineers", "auditors"])).toEqual([
      "engineers",
      "auditors"
    ]);
  });

  it("returns a new array each time, so callers can't share one", () => {
    const first = nextAgentVaultRoles(["engineers"], []);
    first.push("engineers");
    expect(nextAgentVaultRoles(["engineers"], [])).toEqual([NO_ACCESS]);
    expect(defaultAgentVaultRoles()).toEqual([NO_ACCESS]);
  });
});

describe("isSameRoleSet", () => {
  it("ignores order and repeats", () => {
    expect(isSameRoleSet(["engineers", "auditors"], ["auditors", "engineers"])).toBe(true);
    expect(isSameRoleSet(["engineers", "engineers"], ["engineers"])).toBe(true);
  });

  it("tells different sets apart", () => {
    expect(isSameRoleSet(["engineers"], ["engineers", "auditors"])).toBe(false);
    expect(isSameRoleSet([ADMIN], [NO_ACCESS])).toBe(false);
  });
});

describe("getAgentVaultAdminChangeBlockedReason", () => {
  it("stops a viewer who isn't an Admin from changing an Admin", () => {
    expect(
      getAgentVaultAdminChangeBlockedReason({ isViewerAdmin: false, memberRoles: [ADMIN] })
    ).toBe(AGENT_VAULT_ADMIN_CHANGE_BLOCKED);
    expect(
      getAgentVaultAdminChangeBlockedReason({
        isViewerAdmin: false,
        memberRoles: ["engineers", ADMIN]
      })
    ).toBe("Only an Admin can change an Admin.");
  });

  it("lets an Admin change another Admin", () => {
    expect(
      getAgentVaultAdminChangeBlockedReason({ isViewerAdmin: true, memberRoles: [ADMIN] })
    ).toBeUndefined();
  });

  it("lets anyone allowed to manage members change someone who isn't an Admin", () => {
    expect(
      getAgentVaultAdminChangeBlockedReason({
        isViewerAdmin: false,
        memberRoles: ["engineers", "auditors"]
      })
    ).toBeUndefined();
    expect(
      getAgentVaultAdminChangeBlockedReason({ isViewerAdmin: false, memberRoles: [NO_ACCESS] })
    ).toBeUndefined();
  });

  it("matches the built-in Admin slug only", () => {
    expect(holdsAgentVaultAdmin(["admins"])).toBe(false);
    expect(holdsAgentVaultAdmin([])).toBe(false);
    expect(holdsAgentVaultAdmin([ADMIN])).toBe(true);
  });
});

describe("assignableAgentVaultRoles", () => {
  const options = [{ slug: ADMIN }, { slug: NO_ACCESS }, { slug: "engineers" }];

  it("leaves Admin out for a viewer who isn't an Admin", () => {
    expect(assignableAgentVaultRoles(options, false).map((option) => option.slug)).toEqual([
      NO_ACCESS,
      "engineers"
    ]);
  });

  it("offers every role to an Admin", () => {
    expect(assignableAgentVaultRoles(options, true).map((option) => option.slug)).toEqual([
      ADMIN,
      NO_ACCESS,
      "engineers"
    ]);
  });
});
