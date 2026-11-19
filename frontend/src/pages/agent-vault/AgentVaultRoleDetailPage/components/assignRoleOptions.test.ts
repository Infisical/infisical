import { describe, expect, it } from "vitest";

import { AGENT_VAULT_ADMIN_CHANGE_BLOCKED } from "@app/helpers/agentVaultMembers";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultProductActor, TAgentVaultProductMember } from "@app/hooks/api/agentVault/types";

import {
  AGENT_VAULT_MAX_ACTORS_PER_REQUEST,
  buildAgentVaultAssignOptions,
  planAgentVaultRoleAssignment,
  SELF_ROLE_CHANGE_BLOCKED,
  TAssignOption
} from "./assignRoleOptions";

const ROLE = "engineers";

const user = (id: string, firstName: string, roles?: string[]) => ({
  type: AgentVaultMemberType.User as const,
  id,
  username: `${id}@example.com`,
  email: `${id}@example.com`,
  firstName,
  lastName: null,
  isOrgMembershipPending: false,
  ...(roles ? { roles, isActive: true, addedAt: "2026-11-12T00:00:00.000Z" } : {})
});

const identity = (id: string, name: string, roles?: string[]) => ({
  type: AgentVaultMemberType.MachineIdentity as const,
  id,
  name,
  isManagedByAgentVault: false,
  orgId: null,
  ...(roles ? { roles, isActive: true, addedAt: "2026-11-12T00:00:00.000Z" } : {})
});

const group = (id: string, name: string, roles?: string[]) => ({
  type: AgentVaultMemberType.Group as const,
  id,
  name,
  ...(roles ? { roles, isActive: true, addedAt: "2026-11-12T00:00:00.000Z" } : {})
});

const build = ({
  members = [],
  available = [],
  isViewerAdmin = true,
  viewerUserId = "viewer",
  search = ""
}: {
  members?: TAgentVaultProductMember[];
  available?: TAgentVaultProductActor[];
  isViewerAdmin?: boolean;
  viewerUserId?: string;
  search?: string;
}) =>
  buildAgentVaultAssignOptions({
    roleSlug: ROLE,
    members,
    available,
    isViewerAdmin,
    viewerUserId,
    search
  });

describe("buildAgentVaultAssignOptions", () => {
  it("leaves out members who already hold the role", () => {
    const options = build({
      members: [
        user("u1", "Ada", [ROLE]) as TAgentVaultProductMember,
        user("u2", "Bo", ["no-access"]) as TAgentVaultProductMember
      ]
    });
    expect(options.map((option) => option.id)).toEqual(["u2"]);
  });

  it("offers members with their roles and newcomers without any, once each", () => {
    const options = build({
      members: [identity("i1", "release-bot", ["auditors"]) as TAgentVaultProductMember],
      available: [identity("i1", "release-bot"), identity("i2", "deploy-bot")]
    });
    expect(options.map(({ id, currentRoles }) => ({ id, currentRoles }))).toEqual([
      { id: "i1", currentRoles: ["auditors"] },
      { id: "i2", currentRoles: null }
    ]);
  });

  it("keeps a viewer who isn't an Admin away from an Admin", () => {
    const members = [group("g1", "Platform", ["admin"]) as TAgentVaultProductMember];
    expect(build({ members, isViewerAdmin: false })[0].disabledReason).toBe(
      AGENT_VAULT_ADMIN_CHANGE_BLOCKED
    );
    expect(build({ members, isViewerAdmin: true })[0].disabledReason).toBeUndefined();
  });

  it("keeps the viewer from changing their own roles", () => {
    const options = build({
      members: [user("viewer", "Me", ["auditors"]) as TAgentVaultProductMember]
    });
    expect(options[0].disabledReason).toBe(SELF_ROLE_CHANGE_BLOCKED);
  });

  it("searches members by name and email, and takes newcomers as the server found them", () => {
    const options = build({
      members: [
        user("ada", "Ada", ["no-access"]) as TAgentVaultProductMember,
        user("bo", "Bo", ["no-access"]) as TAgentVaultProductMember
      ],
      available: [user("cy", "Cy")],
      search: "ADA@"
    });
    expect(options.map((option) => option.id)).toEqual(["ada", "cy"]);
  });

  it("lists users, then machine identities, then groups, members ahead of newcomers", () => {
    const options = build({
      members: [
        group("g1", "Platform", ["no-access"]) as TAgentVaultProductMember,
        identity("i1", "zeta-bot", ["no-access"]) as TAgentVaultProductMember,
        user("u1", "Zed", ["no-access"]) as TAgentVaultProductMember
      ],
      available: [user("u2", "Abe"), identity("i2", "alpha-bot")]
    });
    expect(options.map((option) => option.id)).toEqual(["u1", "u2", "i1", "i2", "g1"]);
  });
});

const option = (
  type: AgentVaultMemberType,
  id: string,
  currentRoles: string[] | null
): TAssignOption => ({ type, id, key: `${type}:${id}`, name: id, email: null, currentRoles });

describe("planAgentVaultRoleAssignment", () => {
  it("adds newcomers in one call with just this role", () => {
    const { adds, updates } = planAgentVaultRoleAssignment(ROLE, [
      option(AgentVaultMemberType.User, "u1", null),
      option(AgentVaultMemberType.Group, "g1", null)
    ]);
    expect(adds).toEqual([
      {
        userIds: ["u1"],
        groupIds: ["g1"],
        machineIdentityIds: [],
        roles: [ROLE]
      }
    ]);
    expect(updates).toEqual([]);
  });

  it("keeps each member's other roles and drops No Access", () => {
    const { adds, updates } = planAgentVaultRoleAssignment(ROLE, [
      option(AgentVaultMemberType.User, "u1", ["no-access"]),
      option(AgentVaultMemberType.MachineIdentity, "i1", ["auditors"])
    ]);
    expect(adds).toEqual([]);
    expect(updates).toEqual([
      { userIds: ["u1"], groupIds: [], machineIdentityIds: [], roles: [ROLE] },
      { userIds: [], groupIds: [], machineIdentityIds: ["i1"], roles: ["auditors", ROLE] }
    ]);
  });

  it("sends one update for members who end up with the same roles", () => {
    const { updates } = planAgentVaultRoleAssignment(ROLE, [
      option(AgentVaultMemberType.User, "u1", ["auditors"]),
      option(AgentVaultMemberType.Group, "g1", ["auditors"]),
      option(AgentVaultMemberType.User, "u2", ["no-access"]),
      option(AgentVaultMemberType.MachineIdentity, "i1", [])
    ]);
    expect(updates).toEqual([
      { userIds: ["u1"], groupIds: ["g1"], machineIdentityIds: [], roles: ["auditors", ROLE] },
      { userIds: ["u2"], groupIds: [], machineIdentityIds: ["i1"], roles: [ROLE] }
    ]);
  });

  it("splits newcomers and each role set into calls the API takes", () => {
    const newcomers = Array.from({ length: 150 }, (_, index) =>
      option(AgentVaultMemberType.User, `new-${index}`, null)
    );
    const members = Array.from({ length: 101 }, (_, index) =>
      option(AgentVaultMemberType.MachineIdentity, `bot-${index}`, ["auditors"])
    );
    const { adds, updates } = planAgentVaultRoleAssignment(ROLE, [...newcomers, ...members]);
    expect(adds.map((add) => add.userIds?.length)).toEqual([
      AGENT_VAULT_MAX_ACTORS_PER_REQUEST,
      50
    ]);
    expect(adds.flatMap((add) => add.userIds ?? [])).toEqual(newcomers.map(({ id }) => id));
    expect(updates.map((update) => update.machineIdentityIds?.length)).toEqual([
      AGENT_VAULT_MAX_ACTORS_PER_REQUEST,
      1
    ]);
    expect(updates.every((update) => update.roles.join(",") === `auditors,${ROLE}`)).toBe(true);
  });
});
