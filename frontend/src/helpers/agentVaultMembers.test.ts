import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { describe, expect, it } from "vitest";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { conditionsMatcher } from "@app/hooks/api/roles/permission-matcher";

import {
  AGENT_VAULT_ADMIN_CHANGE_BLOCKED,
  agentVaultMemberActionDeniedReason,
  assignableAgentVaultRoles,
  canAddAgentVaultRole,
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

describe("canAddAgentVaultRole", () => {
  const tenRoles = Array.from({ length: 10 }, (_, index) => `role-${index}`);

  it("stops adding at the most roles a member can have", () => {
    expect(canAddAgentVaultRole(tenRoles.slice(1), "auditors")).toBe(true);
    expect(canAddAgentVaultRole(tenRoles, "auditors")).toBe(false);
  });

  it("still offers a role already held, and No Access, which replaces them", () => {
    expect(canAddAgentVaultRole(tenRoles, "role-0")).toBe(true);
    expect(canAddAgentVaultRole(tenRoles, NO_ACCESS)).toBe(true);
    expect(canAddAgentVaultRole([NO_ACCESS], "auditors")).toBe(true);
  });
});

describe("agentVaultMemberActionDeniedReason", () => {
  const IDENTITY_A = "4c3b6f0e-8f5c-4a0b-9a51-0d2b1c7e5f21";
  const IDENTITY_B = "9686cd1a-659d-48ad-b53c-ec27a39b0830";
  const abilityOf = (rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[]) =>
    createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher });

  it("checks a machine identity's own id, so edit on one identity doesn't offer actions on another", () => {
    const permission = abilityOf([
      {
        action: [ProjectPermissionIdentityActions.Read],
        subject: ProjectPermissionSub.Identity
      },
      {
        action: [ProjectPermissionIdentityActions.Edit, ProjectPermissionIdentityActions.Delete],
        subject: ProjectPermissionSub.Identity,
        conditions: { identityId: { $eq: IDENTITY_A } }
      }
    ]);
    const identity = (id: string) => ({ type: AgentVaultMemberType.MachineIdentity, id });

    expect(
      agentVaultMemberActionDeniedReason(permission, identity(IDENTITY_A), "edit")
    ).toBeUndefined();
    expect(
      agentVaultMemberActionDeniedReason(permission, identity(IDENTITY_A), "remove")
    ).toBeUndefined();
    expect(agentVaultMemberActionDeniedReason(permission, identity(IDENTITY_B), "edit")).toBe(
      "You don't have permission to change this machine identity's roles"
    );
    expect(agentVaultMemberActionDeniedReason(permission, identity(IDENTITY_B), "remove")).toBe(
      "You don't have permission to remove this machine identity"
    );
  });

  it("checks users and groups by kind", () => {
    const permission = abilityOf([
      { action: [ProjectPermissionMemberActions.Edit], subject: ProjectPermissionSub.Member }
    ]);
    const user = { type: AgentVaultMemberType.User, id: "user-1" };
    const group = { type: AgentVaultMemberType.Group, id: "group-1" };

    expect(agentVaultMemberActionDeniedReason(permission, user, "edit")).toBeUndefined();
    expect(agentVaultMemberActionDeniedReason(permission, user, "remove")).toBe(
      "You don't have permission to remove this user"
    );
    expect(agentVaultMemberActionDeniedReason(permission, group, "edit")).toBe(
      "You don't have permission to change this group's roles"
    );
  });
});
