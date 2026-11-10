import crypto from "node:crypto";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas";

import { ActorGrants } from "./actor-grants";
import { TRoleAssignmentProps } from "./role-assignment";

const NOW = new Date("2026-01-01T00:00:00Z");

const role = (overrides: Partial<TRoleAssignmentProps> = {}): TRoleAssignmentProps => ({
  id: crypto.randomUUID(),
  role: ProjectMembershipRole.Member,
  isTemporary: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides
});

const grantsWith = (roles: TRoleAssignmentProps[], privilegePermissions: unknown[] = []) =>
  ActorGrants.restore({
    memberships: [
      {
        id: crypto.randomUUID(),
        scope: AccessScope.Project,
        scopeOrgId: crypto.randomUUID(),
        scopeProjectId: "p1",
        actorUserId: crypto.randomUUID(),
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        roles
      }
    ],
    privileges: privilegePermissions.map((permissions) => ({
      id: crypto.randomUUID(),
      name: "p",
      isTemporary: false,
      permissions,
      actorUserId: crypto.randomUUID(),
      projectId: "p1",
      createdAt: NOW,
      updatedAt: NOW
    })),
    attributes: []
  });

describe("ActorGrants.activeEntries", () => {
  test("should drop a temporary role that has ended and keep one that has not", () => {
    // Setup
    const grants = grantsWith([
      role({ role: "ended", isTemporary: true, temporaryAccessEndTime: new Date(NOW.getTime() - 1) }),
      role({ role: "running", isTemporary: true, temporaryAccessEndTime: new Date(NOW.getTime() + 1) })
    ]);

    // Action
    const entries = grants.activeEntries("custom", NOW);

    // Assert
    expect(entries.map((entry) => entry.role)).toEqual(["running"]);
  });

  test("should list privileges after roles under the custom slug", () => {
    // Setup
    const grants = grantsWith([role()], [["packed"]]);

    // Action
    const entries = grants.activeEntries("custom", NOW);

    // Assert
    expect(entries).toEqual([
      { role: ProjectMembershipRole.Member, permissions: undefined },
      { role: "custom", permissions: ["packed"] }
    ]);
  });

  test("should treat a temporary role without an end time as never active", () => {
    // Setup
    const grants = grantsWith([role({ isTemporary: true, temporaryAccessEndTime: null })]);

    // Action
    const entries = grants.activeEntries("custom", NOW);

    // Assert
    expect(entries).toEqual([]);
  });
});

describe("ActorGrants.hasActiveBuiltInRole", () => {
  test("should not match a custom role whose slug equals the built-in slug", () => {
    // Setup
    const grants = grantsWith([role({ role: "custom", customRoleId: crypto.randomUUID(), customRoleSlug: "admin" })]);

    // Action
    const isBuiltInAdmin = grants.hasActiveBuiltInRole(ProjectMembershipRole.Admin, NOW);

    // Assert
    expect(isBuiltInAdmin).toBe(false);
    expect(grants.hasActiveRole("admin", NOW)).toBe(true);
  });
});
