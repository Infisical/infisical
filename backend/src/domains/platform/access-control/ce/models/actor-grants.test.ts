import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";

import { ActorGrants, TActorGrantsRecord } from "./actor-grants";
import { TMembershipRecord } from "./membership";
import { TPrivilegeRecord } from "./privilege";
import { TRoleAssignmentRecord } from "./role-assignment";

const NOW = new Date("2026-01-01T00:00:00Z");
const BEFORE = new Date(NOW.getTime() - 1);
const AFTER = new Date(NOW.getTime() + 1);

const roleRecord = (overrides: Partial<TRoleAssignmentRecord> = {}): TRoleAssignmentRecord => ({
  id: randomUUID(),
  role: ProjectMembershipRole.Member,
  isTemporary: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides
});

const membershipRecord = (roles: TRoleAssignmentRecord[]): TMembershipRecord => ({
  id: randomUUID(),
  scope: AccessScope.Project,
  scopeOrgId: randomUUID(),
  scopeProjectId: "p1",
  actorUserId: randomUUID(),
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  roles
});

const privilegeRecord = (overrides: Partial<TPrivilegeRecord> = {}): TPrivilegeRecord => ({
  id: randomUUID(),
  name: "p",
  isTemporary: false,
  permissions: packRules([{ action: "read", subject: "secrets" }]),
  actorUserId: randomUUID(),
  projectId: "p1",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides
});

const grantsWith = (roles: TRoleAssignmentRecord[], privileges: TPrivilegeRecord[] = []) =>
  ActorGrants.restore({ memberships: [membershipRecord(roles)], privileges, attributes: [] });

describe("ActorGrants.active", () => {
  test("should drop a temporary role that has ended and keep one that has not", () => {
    // Setup
    const grants = grantsWith([
      roleRecord({ role: "ended", isTemporary: true, temporaryAccessEndTime: BEFORE }),
      roleRecord({ role: "running", isTemporary: true, temporaryAccessEndTime: AFTER })
    ]);

    // Action
    const slugs = grants.active(NOW).map((grant) => grant.builtInSlug());

    // Assert
    expect(slugs).toEqual(["running"]);
  });

  test("should drop a temporary privilege that has ended", () => {
    // Setup
    const grants = grantsWith(
      [roleRecord()],
      [
        privilegeRecord({ isTemporary: true, temporaryAccessEndTime: BEFORE }),
        privilegeRecord({ isTemporary: true, temporaryAccessEndTime: AFTER })
      ]
    );

    // Action
    const active = grants.active(NOW);

    // Assert
    expect(active).toHaveLength(2);
  });

  test("should list roles before privileges, a privilege as a custom grant", () => {
    // Setup
    const grants = grantsWith([roleRecord()], [privilegeRecord()]);

    // Action
    const active = grants.active(NOW);

    // Assert
    expect(active.map((grant) => grant.builtInSlug())).toEqual([ProjectMembershipRole.Member, null]);
    expect(active[1].customRules()).toMatchObject([{ action: ["read"], subject: ["secrets"] }]);
  });

  test("should treat a temporary role without an end time as never active", () => {
    // Setup
    const grants = grantsWith([roleRecord({ isTemporary: true, temporaryAccessEndTime: null })]);

    // Action
    const active = grants.active(NOW);

    // Assert
    expect(active).toEqual([]);
  });
});

describe("ActorGrants.hasActiveRole", () => {
  test("should match a built-in slug and a custom role's own slug, but not an ended role", () => {
    // Setup
    const grants = grantsWith([
      roleRecord({ role: "custom", customRoleId: randomUUID(), customRoleSlug: "biller" }),
      roleRecord({ role: "admin" }),
      roleRecord({ role: "viewer", isTemporary: true, temporaryAccessEndTime: BEFORE })
    ]);

    // Action
    const results = ["biller", "admin", "viewer"].map((slug) => grants.hasActiveRole(slug, NOW));

    // Assert
    expect(results).toEqual([true, true, false]);
  });
});

describe("ActorGrants.hasActiveBuiltInRole", () => {
  test("should not match a custom role whose slug equals the built-in slug", () => {
    // Setup
    const grants = grantsWith([roleRecord({ role: "custom", customRoleId: randomUUID(), customRoleSlug: "admin" })]);

    // Action
    const isBuiltInAdmin = grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin, NOW);

    // Assert
    expect(isBuiltInAdmin).toBe(false);
    expect(grants.hasActiveRole("admin", NOW)).toBe(true);
  });

  test("should match a built-in role", () => {
    // Setup
    const grants = grantsWith([roleRecord({ role: ProjectMembershipRole.Admin })]);

    // Action
    const isBuiltInAdmin = grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin, NOW);

    // Assert
    expect(isBuiltInAdmin).toBe(true);
  });
});

describe("ActorGrants.merge", () => {
  test("should hold the memberships, privileges and attributes of both", () => {
    // Setup
    const first = ActorGrants.restore({
      memberships: [membershipRecord([roleRecord({ role: "admin" })])],
      privileges: [privilegeRecord()],
      attributes: [{ id: "a1", key: "team", value: "a" }]
    });
    const second = ActorGrants.restore({
      memberships: [membershipRecord([roleRecord({ role: "viewer" })])],
      privileges: [],
      attributes: [{ id: "a2", key: "region", value: "eu" }]
    });

    // Action
    const merged = first.merge(second);

    // Assert
    expect(merged.memberships).toHaveLength(2);
    expect(merged.active(NOW)).toHaveLength(3);
    expect(merged.attributeMap()).toEqual({ team: "a", region: "eu" });
  });

  test("should leave both inputs unchanged", () => {
    // Setup
    const first = grantsWith([roleRecord()]);
    const second = grantsWith([roleRecord()]);

    // Action
    first.merge(second);

    // Assert
    expect(first.memberships).toHaveLength(1);
    expect(second.memberships).toHaveLength(1);
  });
});

describe("ActorGrants.empty", () => {
  test("should have no membership and no active grants", () => {
    // Setup
    const grants = ActorGrants.empty();

    // Action
    const results = [grants.hasMembership, grants.active(NOW), grants.attributeMap()];

    // Assert
    expect(results).toEqual([false, [], {}]);
  });
});

describe("ActorGrants.toJSON and restore", () => {
  test("should round trip through JSON with dates read back as strings", () => {
    // Setup
    const grants = ActorGrants.restore({
      memberships: [
        membershipRecord([roleRecord({ isTemporary: true, temporaryAccessEndTime: AFTER, customRoleSlug: "biller" })])
      ],
      privileges: [privilegeRecord({ isTemporary: true, temporaryAccessEndTime: AFTER })],
      attributes: [{ id: "a1", key: "team", value: "a" }]
    });

    // Action
    const revived = ActorGrants.restore(JSON.parse(JSON.stringify(grants.toJSON())) as TActorGrantsRecord);

    // Assert
    expect(revived.toJSON()).toEqual(grants.toJSON());
    expect(revived.active(NOW)).toHaveLength(2);
    expect(revived.active(new Date(AFTER.getTime() + 1))).toHaveLength(0);
    expect(revived.hasActiveRole("biller", NOW)).toBe(true);
    expect(revived.attributeMap()).toEqual({ team: "a" });
  });
});
