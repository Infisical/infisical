import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { removeIdentityFromGroupsOwnedByOrg } from "./group-fns";

const IDENTITY_ID = "identity-1";
const ORG_ID = "org-1";
const TX = { marker: "tx" } as unknown as Knex;

// A small in-memory model: which groups the identity is in, which projects each group is on, and
// which projects the identity reaches some other way. Deleting a group row updates it, so the
// reachability each group sees depends on the groups removed before it.
const createDeps = ({
  groupProjects,
  reachedOtherwise = []
}: {
  groupProjects: Record<string, string[]>;
  reachedOtherwise?: string[];
}) => {
  const memberOf = new Set(Object.keys(groupProjects));
  const deletePrivileges = vi.fn().mockResolvedValue(undefined);

  const deps = {
    membershipDAL: {
      find: vi.fn(async ({ actorGroupId }: { actorGroupId: string }) =>
        groupProjects[actorGroupId].map((scopeProjectId) => ({ scopeProjectId }))
      )
    },
    identityGroupMembershipDAL: {
      findGroupIdsOwnedByOrg: vi.fn(async () => Array.from(memberOf)),
      filterProjectsByIdentityMembership: vi.fn(
        async (_identityIds: string[], groupId: string, projectIds: string[]) => {
          const viaOtherGroups = Array.from(memberOf)
            .filter((other) => other !== groupId)
            .flatMap((other) => groupProjects[other]);
          const reachable = projectIds.filter((p) => reachedOtherwise.includes(p) || viaOtherGroups.includes(p));
          return new Map([[IDENTITY_ID, new Set(reachable)]]);
        }
      ),
      delete: vi.fn(async ({ groupId }: { groupId: string }) => {
        memberOf.delete(groupId);
        return [];
      })
    },
    additionalPrivilegeDAL: { delete: deletePrivileges }
  };

  return { deps: deps as never as Parameters<typeof removeIdentityFromGroupsOwnedByOrg>[0], deletePrivileges };
};

const reapedProjects = (deletePrivileges: ReturnType<typeof vi.fn>) =>
  deletePrivileges.mock.calls.flatMap(([filter]) => (filter as { $in: { projectId: string[] } }).$in.projectId).sort();

describe("removeIdentityFromGroupsOwnedByOrg", () => {
  beforeEach(() => vi.clearAllMocks());

  test("reaps privileges on projects only the org's groups reached, and keeps the rest", async () => {
    const { deps, deletePrivileges } = createDeps({
      groupProjects: { "group-a": ["only-a", "also-direct"], "group-b": ["only-b"] },
      reachedOtherwise: ["also-direct"]
    });

    await removeIdentityFromGroupsOwnedByOrg({ ...deps, identityId: IDENTITY_ID, orgId: ORG_ID }, TX);

    expect(reapedProjects(deletePrivileges)).toEqual(["only-a", "only-b"]);
    expect(deletePrivileges).toHaveBeenCalledWith({ actorIdentityId: IDENTITY_ID, $in: { projectId: ["only-a"] } }, TX);
  });

  test("reaps a project two of the org's groups shared once both are gone", async () => {
    const { deps, deletePrivileges } = createDeps({
      groupProjects: { "group-a": ["shared"], "group-b": ["shared"] }
    });

    await removeIdentityFromGroupsOwnedByOrg({ ...deps, identityId: IDENTITY_ID, orgId: ORG_ID }, TX);

    expect(reapedProjects(deletePrivileges)).toEqual(["shared"]);
  });

  test("does nothing when the identity is in none of the org's groups", async () => {
    const { deps, deletePrivileges } = createDeps({ groupProjects: {} });

    await removeIdentityFromGroupsOwnedByOrg({ ...deps, identityId: IDENTITY_ID, orgId: ORG_ID }, TX);

    expect(deletePrivileges).not.toHaveBeenCalled();
  });
});
