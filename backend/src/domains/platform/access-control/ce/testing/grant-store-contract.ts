import { randomUUID } from "node:crypto";

import { packRules, unpackRules } from "@casl/ability/extra";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, RESOURCE_SCOPE } from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";

import { TGrantStore } from "../services/dependencies";
import { TGrantSeeder, TSeedActor, TSeedRole } from "./grant-fixture";
import { InMemoryGrantSeeder } from "./in-memory-grant-seeder";
import { InMemoryGrantStore } from "./in-memory-grant-store";

// Organizations, projects, users, identities and folders belong to no store here, so each backend creates them its
// own way.
export type TGrantStoreFixture = {
  store: TGrantStore;
  seed: TGrantSeeder;
  newOrg: () => Promise<string>;
  newProject: (orgId: string) => Promise<string>;
  newUser: () => Promise<string>;
  newIdentity: (orgId: string) => Promise<string>;
  newFolder: (projectId: string) => Promise<string>;
};

export const inMemoryGrantStoreFixture = async (): Promise<TGrantStoreFixture> => {
  const store = new InMemoryGrantStore();
  return {
    store,
    seed: new InMemoryGrantSeeder(store),
    newOrg: async () => randomUUID(),
    newProject: async () => randomUUID(),
    newUser: async () => randomUUID(),
    newIdentity: async () => randomUUID(),
    newFolder: async () => randomUUID()
  };
};

const sorted = (ids: string[]) => [...ids].sort();

export const describeGrantStoreContract = (name: string, setup: () => Promise<TGrantStoreFixture>) => {
  const arrange = async () => {
    const fixture = await setup();
    const orgId = await fixture.newOrg();
    const projectId = await fixture.newProject(orgId);
    const userId = await fixture.newUser();
    const user = { type: ActorType.USER as const, id: userId };
    const projectScope = { scope: AccessScope.Project as const, orgId, projectId };
    const projectMembership = (actor: TSeedActor | { groupId: string }, roles?: TSeedRole[], inProject = projectId) =>
      fixture.seed.membership({
        scope: AccessScope.Project,
        orgId,
        projectId: inProject,
        actor,
        roles
      });
    return { ...fixture, orgId, projectId, userId, user, projectScope, projectMembership };
  };

  describe(`GrantStore contract (${name})`, () => {
    describe("findActorGrants", () => {
      test("should return the user's direct project membership with its role", async () => {
        // Setup
        const { store, userId, user, projectScope, projectMembership } = await arrange();
        await projectMembership({ userId });

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.memberships).toHaveLength(1);
        expect(grants.memberships[0].roles.map((role) => role.role)).toEqual([ProjectMembershipRole.Member]);
      });

      test("should return nothing for an actor with no membership in the project", async () => {
        // Setup
        const { store, orgId, userId, user, projectScope, projectMembership, newProject } = await arrange();
        await projectMembership({ userId }, undefined, await newProject(orgId));

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.hasMembership).toBe(false);
      });

      test("should return a membership the user holds through a group", async () => {
        // Setup
        const { store, seed, orgId, userId, user, projectScope, projectMembership } = await arrange();
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId });
        await projectMembership({ groupId: group.id }, [{ role: ProjectMembershipRole.Viewer }]);

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.memberships.map((membership) => membership.viaGroupId)).toEqual([group.id]);
        expect(grants.hasActiveRole(ProjectMembershipRole.Viewer)).toBe(true);
      });

      test("should return a membership an identity holds through a group", async () => {
        // Setup
        const { store, seed, orgId, projectScope, projectMembership, newIdentity } = await arrange();
        const identityId = await newIdentity(orgId);
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, identityId });
        await projectMembership({ groupId: group.id });

        // Action
        const grants = await store.findActorGrants({ type: ActorType.IDENTITY, id: identityId }, projectScope);

        // Assert
        expect(grants.memberships.map((membership) => membership.viaGroupId)).toEqual([group.id]);
      });

      test.each([ActorType.USER, ActorType.IDENTITY] as const)(
        "should return a %s's direct and group memberships in the project and none of another project's",
        async (actorType) => {
          // Setup
          const { store, seed, orgId, projectScope, projectMembership, newProject, newUser, newIdentity } =
            await arrange();
          const actorId = actorType === ActorType.USER ? await newUser() : await newIdentity(orgId);
          const seedActor = actorType === ActorType.USER ? { userId: actorId } : { identityId: actorId };
          const group = await seed.group({ orgId });
          await seed.groupMember({ groupId: group.id, ...seedActor });
          const direct = await projectMembership(seedActor);
          const viaGroup = await projectMembership({ groupId: group.id });
          const otherProjectId = await newProject(orgId);
          await projectMembership(seedActor, undefined, otherProjectId);
          await projectMembership({ groupId: group.id }, undefined, otherProjectId);

          // Action
          const grants = await store.findActorGrants({ type: actorType, id: actorId }, projectScope);

          // Assert
          expect(sorted(grants.memberships.map((membership) => membership.id))).toEqual(
            sorted([direct.id, viaGroup.id])
          );
        }
      );

      test("should not return a group membership to a user outside the group", async () => {
        // Setup
        const { store, seed, orgId, user, projectScope, projectMembership, newUser } = await arrange();
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId: await newUser() });
        await projectMembership({ groupId: group.id });

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.hasMembership).toBe(false);
      });

      test("should return a custom role's own slug and rules with the assignment", async () => {
        // Setup
        const { store, seed, projectId, userId, user, projectScope, projectMembership } = await arrange();
        const packed = packRules([{ action: "read", subject: "secrets" }]);
        const role = await seed.role({ owner: { projectId }, slug: "reader", permissions: packed });
        await projectMembership({ userId }, [{ role: "custom", customRoleId: role.id }]);

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        const [grant] = grants.active();
        expect(grants.hasActiveRole("reader")).toBe(true);
        expect(grants.hasActiveBuiltInRole("reader")).toBe(false);
        expect(grant.isCustom()).toBe(true);
        expect(grant.customRules()).toEqual(unpackRules(packed));
      });

      test("should not return a membership that has no role assignment", async () => {
        // Setup
        const { store, userId, user, projectScope, projectMembership } = await arrange();
        await projectMembership({ userId }, []);

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.hasMembership).toBe(false);
      });

      test("should return the actor's project privileges but not its folder grants or another project's", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectScope, projectMembership, newProject, newFolder } =
          await arrange();
        const otherProjectId = await newProject(orgId);
        await projectMembership({ userId });
        const kept = await seed.privilege({ actor: { userId }, projectId });
        await seed.privilege({ actor: { userId }, projectId: otherProjectId });
        await seed.privilege({
          actor: { userId },
          projectId,
          folder: { id: await newFolder(projectId), role: "admin" }
        });

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.toJSON().privileges.map((privilege) => privilege.id)).toEqual([kept.id]);
      });

      test("should return org memberships and org privileges only at the org scope", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership } = await arrange();
        await projectMembership({ userId });
        const orgMembership = await seed.membership({
          scope: AccessScope.Organization,
          orgId,
          actor: { userId },
          roles: [{ role: OrgMembershipRole.Admin }]
        });
        const orgPrivilege = await seed.privilege({ actor: { userId }, orgId });
        await seed.privilege({ actor: { userId }, projectId });

        // Action
        const grants = await store.findActorGrants(user, { scope: AccessScope.Organization, orgId });

        // Assert
        expect(grants.memberships.map((membership) => membership.id)).toEqual([orgMembership.id]);
        expect(grants.toJSON().privileges.map((privilege) => privilege.id)).toEqual([orgPrivilege.id]);
      });

      test("should return a user's attributes in this org only", async () => {
        // Setup
        const { store, seed, orgId, userId, user, projectScope, projectMembership, newOrg } = await arrange();
        await projectMembership({ userId });
        await seed.attribute({ orgId, actor: { userId }, key: "team", value: "a" });
        await seed.attribute({ orgId: await newOrg(), actor: { userId }, key: "team", value: "b" });

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.attributeMap()).toEqual({ team: "a" });
      });

      test("should return an identity's own attributes", async () => {
        // Setup
        const { store, seed, orgId, projectScope, projectMembership, newIdentity } = await arrange();
        const identityId = await newIdentity(orgId);
        await projectMembership({ identityId });
        await seed.attribute({ orgId, actor: { identityId }, key: "team", value: "a" });
        await seed.attribute({ orgId, actor: { identityId: await newIdentity(orgId) }, key: "team", value: "b" });

        // Action
        const grants = await store.findActorGrants({ type: ActorType.IDENTITY, id: identityId }, projectScope);

        // Assert
        expect(grants.attributeMap()).toEqual({ team: "a" });
      });

      test("should return memberships ordered by id", async () => {
        // Setup
        const { store, seed, orgId, userId, user, projectScope, projectMembership } = await arrange();
        const memberships = await Promise.all(
          Array.from({ length: 4 }, async () => {
            const group = await seed.group({ orgId });
            await seed.groupMember({ groupId: group.id, userId });
            return projectMembership({ groupId: group.id });
          })
        );

        // Action
        const grants = await store.findActorGrants(user, projectScope);

        // Assert
        expect(grants.memberships.map((membership) => membership.id)).toEqual(
          sorted(memberships.map((membership) => membership.id))
        );
      });

      test("should return only the active memberships of the requested resource, and no privileges", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user } = await arrange();
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId });
        await seed.privilege({ actor: { userId }, projectId });
        const resource = { scope: RESOURCE_SCOPE, orgId, projectId, resourceType: "pam-folder" } as const;
        await seed.membership({ ...resource, resourceId: "f1", actor: { userId }, roles: [{ role: "admin" }] });
        await seed.membership({ ...resource, resourceId: "f2", actor: { userId }, roles: [{ role: "operator" }] });
        await seed.membership({
          ...resource,
          resourceId: "f1",
          actor: { groupId: group.id },
          isActive: false,
          roles: [{ role: "auditor" }]
        });

        // Action
        const grants = await store.findActorGrants(user, { ...resource, resourceId: "f1" });

        // Assert
        expect(grants.memberships.flatMap((membership) => membership.roles.map((role) => role.role))).toEqual([
          "admin"
        ]);
        expect(grants.toJSON().privileges).toEqual([]);
      });
    });

    describe("findResourceMembershipsForActor", () => {
      test("should find an actor's memberships on one resource type, direct and through groups, active or not", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, newProject } = await arrange();
        const otherProjectId = await newProject(orgId);
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId });
        const bundle = { scope: RESOURCE_SCOPE, orgId, resourceType: "agent-vault-access-bundle" } as const;
        await seed.membership({ ...bundle, projectId, resourceId: "b1", actor: { userId } });
        await seed.membership({
          ...bundle,
          projectId,
          resourceId: "b2",
          actor: { groupId: group.id },
          isActive: false
        });
        await seed.membership({ ...bundle, projectId: otherProjectId, resourceId: "b3", actor: { userId } });
        await seed.membership({
          ...bundle,
          projectId,
          resourceType: "pam-folder",
          resourceId: "f1",
          actor: { userId }
        });

        // Action
        const memberships = await store.findResourceMembershipsForActor({
          actor: user,
          projectId,
          resourceType: "agent-vault-access-bundle"
        });

        // Assert
        expect(memberships.map((membership) => membership.resourceId).sort()).toEqual(["b1", "b2"]);
      });

      test("should return the roles of each membership", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user } = await arrange();
        await seed.membership({
          scope: RESOURCE_SCOPE,
          orgId,
          projectId,
          resourceType: "agent-vault-access-bundle",
          resourceId: "b1",
          actor: { userId },
          roles: [{ role: "consumer" }, { role: "owner" }]
        });

        // Action
        const [membership] = await store.findResourceMembershipsForActor({
          actor: user,
          projectId,
          resourceType: "agent-vault-access-bundle"
        });

        // Assert
        expect(membership.roles.map((role) => role.role).sort()).toEqual(["consumer", "owner"]);
      });
    });

    describe("findResourceMembershipsForActors", () => {
      test("should pair each actor with its memberships on the resource types, direct and through groups", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, newUser, newIdentity, newProject } = await arrange();
        const otherUserId = await newUser();
        const identityId = await newIdentity(orgId);
        const outsiderId = await newUser();
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId });
        await seed.groupMember({ groupId: group.id, identityId });
        const resource = { scope: RESOURCE_SCOPE, orgId, projectId } as const;
        await seed.membership({ ...resource, resourceType: "pam-folder", resourceId: "f1", actor: { userId } });
        await seed.membership({
          ...resource,
          resourceType: "pam-account",
          resourceId: "a1",
          actor: { userId: otherUserId },
          isActive: false
        });
        await seed.membership({
          ...resource,
          resourceType: "pam-folder",
          resourceId: "f2",
          actor: { groupId: group.id }
        });
        await seed.membership({
          ...resource,
          resourceType: "pam-folder",
          resourceId: "f3",
          actor: { userId: outsiderId }
        });
        await seed.membership({ ...resource, resourceType: "signer", resourceId: "s1", actor: { userId } });
        await seed.membership({
          scope: RESOURCE_SCOPE,
          orgId,
          projectId: await newProject(orgId),
          resourceType: "pam-folder",
          resourceId: "f4",
          actor: { userId }
        });

        // Action
        const memberships = await store.findResourceMembershipsForActors({
          actors: [user, { type: ActorType.USER, id: otherUserId }, { type: ActorType.IDENTITY, id: identityId }],
          projectId,
          resourceTypes: ["pam-folder", "pam-account"]
        });

        // Assert
        expect(
          memberships.map(({ actor, membership }) => `${actor.type}:${actor.id}:${membership.resourceId}`).sort()
        ).toEqual(
          [
            `${ActorType.USER}:${userId}:f1`,
            `${ActorType.USER}:${userId}:f2`,
            `${ActorType.USER}:${otherUserId}:a1`,
            `${ActorType.IDENTITY}:${identityId}:f2`
          ].sort()
        );
      });

      test("should return the roles of each membership", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user } = await arrange();
        await seed.membership({
          scope: RESOURCE_SCOPE,
          orgId,
          projectId,
          resourceType: "pam-folder",
          resourceId: "f1",
          actor: { userId },
          roles: [{ role: "operator" }, { role: "auditor" }]
        });

        // Action
        const [{ membership }] = await store.findResourceMembershipsForActors({
          actors: [user],
          projectId,
          resourceTypes: ["pam-folder"]
        });

        // Assert
        expect(membership.roles.map((role) => role.role).sort()).toEqual(["auditor", "operator"]);
      });

      test("should return nothing for no actors or no resource types", async () => {
        // Setup
        const { store, projectId, user } = await arrange();

        // Action
        const results = await Promise.all([
          store.findResourceMembershipsForActors({ actors: [], projectId, resourceTypes: ["pam-folder"] }),
          store.findResourceMembershipsForActors({ actors: [user], projectId, resourceTypes: [] })
        ]);

        // Assert
        expect(results).toEqual([[], []]);
      });
    });

    describe("findGrantsFingerprint", () => {
      test("should keep the same fingerprint when nothing changed", async () => {
        // Setup
        const { store, orgId, projectId, userId, user, projectMembership } = await arrange();
        await projectMembership({ userId });
        const first = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Action
        const second = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(second).toBe(first);
      });

      test("should change the fingerprint when a privilege is added or a membership removed", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership } = await arrange();
        const membership = await projectMembership({ userId });
        const before = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Action
        await seed.privilege({ actor: { userId }, projectId });
        const afterPrivilege = await store.findGrantsFingerprint(user, { orgId, projectId });
        await seed.removeMembership(membership.id);
        const afterRemoval = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(new Set([before, afterPrivilege, afterRemoval]).size).toBe(3);
      });

      test("should change the fingerprint when an attribute or a role assignment is added", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership } = await arrange();
        await projectMembership({ userId });
        const before = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Action
        await seed.attribute({ orgId, actor: { userId }, key: "team", value: "a" });
        const afterAttribute = await store.findGrantsFingerprint(user, { orgId, projectId });
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId });
        await projectMembership({ groupId: group.id });
        const afterGroupMembership = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(new Set([before, afterAttribute, afterGroupMembership]).size).toBe(3);
      });

      test("should change the fingerprint when a temporary role ends", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership } = await arrange();
        const membership = await projectMembership({ userId }, [
          { role: ProjectMembershipRole.Member, temporaryAccessEndTime: new Date(Date.now() + 3_600_000) }
        ]);
        const before = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Action
        await seed.endRoleAssignment(membership.roles[0].id);
        const after = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(after).not.toBe(before);
      });

      test("should change the fingerprint when a membership is deactivated", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership } = await arrange();
        const membership = await projectMembership({ userId });
        const before = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Action
        await seed.deactivateMembership(membership.id);
        const after = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(after).not.toBe(before);
      });

      test("should change the fingerprint when the actor's group gains an org role", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership } = await arrange();
        await projectMembership({ userId });
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId });
        const before = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Action
        await seed.membership({
          scope: AccessScope.Organization,
          orgId,
          actor: { groupId: group.id },
          roles: [{ role: OrgMembershipRole.Member }]
        });
        const after = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(after).not.toBe(before);
      });

      test("should keep the fingerprint when the actor or its group joins another project", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership, newProject } = await arrange();
        await projectMembership({ userId });
        const group = await seed.group({ orgId });
        await seed.groupMember({ groupId: group.id, userId });
        const before = await store.findGrantsFingerprint(user, { orgId, projectId });
        const otherProjectId = await newProject(orgId);

        // Action
        await projectMembership({ userId }, undefined, otherProjectId);
        await projectMembership({ groupId: group.id }, undefined, otherProjectId);
        const after = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(after).toBe(before);
      });

      test("should keep the fingerprint when only another actor's grants change", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, projectMembership, newUser } = await arrange();
        await projectMembership({ userId });
        const before = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Action
        await projectMembership({ userId: await newUser() });
        await seed.privilege({ actor: { userId: await newUser() }, projectId });
        const after = await store.findGrantsFingerprint(user, { orgId, projectId });

        // Assert
        expect(after).toBe(before);
      });
    });

    describe("findProjectMemberGrants", () => {
      test("should list every project member with its roles, and the project privileges and attributes of its members", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, projectMembership, newIdentity, newUser } = await arrange();
        const identityId = await newIdentity(orgId);
        const outsiderId = await newUser();
        const group = await seed.group({ orgId });
        await projectMembership({ userId });
        await projectMembership({ identityId }, [{ role: ProjectMembershipRole.Viewer }]);
        await projectMembership({ groupId: group.id });
        const privilege = await seed.privilege({ actor: { userId }, projectId });
        await seed.attribute({ orgId, actor: { userId }, key: "team", value: "a" });
        await seed.attribute({ orgId, actor: { userId: outsiderId }, key: "team", value: "b" });

        // Action
        const members = await store.findProjectMemberGrants({ orgId, projectId });

        // Assert
        expect(sorted(members.directMembers().map(({ actor }) => actor.id))).toEqual(sorted([identityId, userId]));
        expect(members.groupMembers().map(({ groupId }) => groupId)).toEqual([group.id]);
        const userGrants = members.grantsFor({ actor: { type: ActorType.USER, id: userId }, groupIds: [group.id] });
        expect(userGrants.memberships).toHaveLength(2);
        expect(userGrants.toJSON().privileges.map(({ id }) => id)).toEqual([privilege.id]);
        expect(userGrants.attributeMap()).toEqual({ team: "a" });
      });

      test("should leave out another project's members and the folder grants", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, projectMembership, newProject, newFolder } = await arrange();
        const otherProjectId = await newProject(orgId);
        await projectMembership({ userId }, undefined, otherProjectId);
        await seed.privilege({
          actor: { userId },
          projectId,
          folder: { id: await newFolder(projectId), role: "admin" }
        });

        // Action
        const members = await store.findProjectMemberGrants({ orgId, projectId });

        // Assert
        expect(members.memberships).toEqual([]);
        expect(members.toJSON().privileges).toEqual([]);
      });

      test("should not list a membership that has no role assignment", async () => {
        // Setup
        const { store, orgId, projectId, userId, projectMembership } = await arrange();
        await projectMembership({ userId }, []);

        // Action
        const members = await store.findProjectMemberGrants({ orgId, projectId });

        // Assert
        expect(members.memberships).toEqual([]);
      });
    });

    describe("findFolderGrants and findProjectFolderGrants", () => {
      test("should return the actor's own folder grants in the project", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, user, newUser, newProject, newFolder } = await arrange();
        const otherProjectId = await newProject(orgId);
        const mine = await seed.privilege({
          actor: { userId },
          projectId,
          folder: { id: await newFolder(projectId), role: "admin" }
        });
        await seed.privilege({
          actor: { userId: await newUser() },
          projectId,
          folder: { id: await newFolder(projectId), role: "admin" }
        });
        await seed.privilege({
          actor: { userId },
          projectId: otherProjectId,
          folder: { id: await newFolder(otherProjectId), role: "admin" }
        });
        await seed.privilege({ actor: { userId }, projectId });

        // Action
        const grants = await store.findFolderGrants({ actor: user, projectId });

        // Assert
        expect(grants.map((grant) => grant.id)).toEqual([mine.id]);
        expect(grants[0].folderRole).toBe("admin");
      });

      test("should return every folder grant in the project of every actor", async () => {
        // Setup
        const { store, seed, orgId, projectId, userId, newIdentity, newProject, newFolder } = await arrange();
        const identityId = await newIdentity(orgId);
        const first = await seed.privilege({
          actor: { userId },
          projectId,
          folder: { id: await newFolder(projectId), role: "admin" }
        });
        const second = await seed.privilege({
          actor: { identityId },
          projectId,
          folder: { id: await newFolder(projectId), role: "viewer" }
        });
        const otherProjectId = await newProject(orgId);
        await seed.privilege({
          actor: { userId },
          projectId: otherProjectId,
          folder: { id: await newFolder(otherProjectId), role: "admin" }
        });
        await seed.privilege({ actor: { userId }, projectId });

        // Action
        const grants = await store.findProjectFolderGrants({ projectId });

        // Assert
        expect(grants.map((grant) => grant.id)).toEqual(sorted([first.id, second.id]));
      });
    });

    describe("findRolesBySlugs", () => {
      test("should find custom roles by slug for their own project only", async () => {
        // Setup
        const { store, seed, orgId, projectId, newProject } = await arrange();
        const otherProjectId = await newProject(orgId);
        const kept = await seed.role({ owner: { projectId }, slug: "biller" });
        await seed.role({ owner: { projectId: otherProjectId }, slug: "auditor" });

        // Action
        const roles = await store.findRolesBySlugs({ owner: { projectId }, slugs: ["biller", "auditor"] });

        // Assert
        expect(roles.map(({ id }) => id)).toEqual([kept.id]);
      });

      test("should find org roles by slug and leave out project roles", async () => {
        // Setup
        const { store, seed, orgId, projectId } = await arrange();
        const kept = await seed.role({ owner: { orgId }, slug: "biller" });
        await seed.role({ owner: { projectId }, slug: "biller" });

        // Action
        const roles = await store.findRolesBySlugs({ owner: { orgId }, slugs: ["biller"] });

        // Assert
        expect(roles.map(({ id }) => id)).toEqual([kept.id]);
      });

      test("should return nothing for no slugs", async () => {
        // Setup
        const { store, seed, orgId } = await arrange();
        await seed.role({ owner: { orgId }, slug: "biller" });

        // Action
        const roles = await store.findRolesBySlugs({ owner: { orgId }, slugs: [] });

        // Assert
        expect(roles).toEqual([]);
      });
    });

    describe("findGroupsByIds", () => {
      test("should return the requested groups only", async () => {
        // Setup
        const { store, seed, orgId } = await arrange();
        const wanted = await seed.group({ orgId });
        await seed.group({ orgId });

        // Action
        const groups = await store.findGroupsByIds([wanted.id, randomUUID()]);

        // Assert
        expect(groups).toEqual([{ id: wanted.id, orgId, name: wanted.name, slug: wanted.slug }]);
      });
    });
  });
};
