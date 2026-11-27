import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { agentVaultMemberRoleIdOf } from "@app/ee/services/agent-vault-member/agent-vault-member-role-fns";
import { PgSqlLock } from "@app/keystore/keystore";

import {
  convertAgentVaultMemberRows,
  createAgentVaultProject,
  deleteAgentVaultProject,
  expireProjectPermissionMarkers
} from "e2e-test/testUtils/agent-vault";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createIdentityActor } from "e2e-test/testUtils/identities";
import { overrideLicenseFeatures } from "e2e-test/testUtils/license";
import { addUserMembership, createUser, deleteUsers } from "e2e-test/testUtils/users";

type TMethod = "GET" | "POST" | "PATCH" | "DELETE";

const GIVE_ADMIN = "Only an Agent Vault admin can give the admin role.";
const TOUCH_ADMIN = "Only an Agent Vault admin can change or remove another admin.";
const OWN_ROLE = "You cannot change your own role";
const ROLES_CHANGED = "A member's roles changed while this request was running. Try again.";

// Resolves once a backend waits on a lock the given one holds: by then a request has done everything before the lock.
const waitUntilBlockedBy = async (pid: number, attemptsLeft = 200): Promise<void> => {
  const { rows } = await testDb.raw(
    "select count(*)::int as waiting from pg_stat_activity where ? = any(pg_blocking_pids(pid))",
    [pid]
  );
  if (rows[0].waiting > 0) return;
  if (attemptsLeft === 0) throw new Error(`No request queued behind the lock held by backend ${pid}`);
  await new Promise((resolve) => {
    setTimeout(resolve, 25);
  });
  await waitUntilBlockedBy(pid, attemptsLeft - 1);
};

// The platform's own membership routes reach an Agent Vault project's members too, so the rules the Agent Vault members
// routes keep (only an admin makes or unmakes an admin, an older client's `member` keeps access bundle roles) hold
// there as well. The org is the spec's own and uses the new privilege system, where assign-role alone lets a role give
// any role, which is where these routes let a non-admin make an admin.
describe("Agent Vault through the generic membership routes", () => {
  let orgId: string;
  let adminToken: string;
  let projectId: string;
  let cleanup: () => Promise<void>;
  let managerToken: string;
  let managerIdentityId: string;
  const userIds: string[] = [];

  const requester = (token: () => string) => async (method: TMethod, url: string, body?: Record<string, unknown>) => {
    await expireProjectPermissionMarkers(projectId);
    return testServer.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token()}` },
      ...(body ? { body } : {})
    });
  };
  // The seed user, who made the org and the Agent Vault project and is admin of both.
  const asAdmin = requester(() => adminToken);
  // A machine identity whose only role manages members, groups and machine identities and assigns any role.
  const asManager = requester(() => managerToken);

  const identityPath = (identityId: string) => `/api/v1/projects/${projectId}/memberships/identities/${identityId}`;

  const createOrgIdentity = async (name: string) => {
    const res = await asAdmin("POST", "/api/v1/identities", {
      name: `${name}-${Date.now()}`,
      role: OrgMembershipRole.Member,
      organizationId: orgId
    });
    expect(res.statusCode, res.payload).toBe(200);
    return res.json().identity.id as string;
  };

  const projectMembershipOf = async (actor: { actorIdentityId?: string; actorUserId?: string }) => {
    const membership = (await testDb(TableName.Membership)
      .where({ scope: AccessScope.Project, scopeProjectId: projectId, ...actor })
      .first()) as { id: string } | undefined;
    if (!membership) throw new Error("The actor has no membership in the project");
    return membership;
  };

  const roleSlugsOf = async (membershipId: string) =>
    (
      (await testDb(TableName.MembershipRole)
        .leftJoin(TableName.Role, `${TableName.Role}.id`, `${TableName.MembershipRole}.customRoleId`)
        .where(`${TableName.MembershipRole}.membershipId`, membershipId)
        .select(`${TableName.MembershipRole}.role`, `${TableName.Role}.slug`)) as { role: string; slug: string | null }[]
    )
      .map((row) => row.slug ?? row.role)
      .sort();

  const createProjectUser = async (role: ProjectMembershipRole) => {
    const { userId } = await createUser("av-generic-membership");
    userIds.push(userId);
    await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
    return addUserMembership({ userId, orgId, projectId, role });
  };

  // Holds the project's role-change lock while `meanwhile` writes, starts the request, and lets it through once it waits
  // on the lock: by then the request has run every check it makes before the lock.
  const runBehindLock = async (
    run: () => ReturnType<typeof asAdmin>,
    meanwhile: (trx: Knex.Transaction) => Promise<unknown> = async () => undefined
  ) => {
    const trx = await testDb.transaction();
    let pending: ReturnType<typeof run> | undefined;
    try {
      const { rows } = await trx.raw("select pg_backend_pid() as pid");
      await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("project", projectId)]);
      await meanwhile(trx);
      pending = run();
      await waitUntilBlockedBy(rows[0].pid);
      await trx.commit();
      return await pending;
    } catch (err) {
      if (!trx.isCompleted()) await trx.rollback();
      await pending?.catch(() => undefined);
      throw err;
    }
  };

  beforeAll(async () => {
    const isolated = await createIsolatedOrgAndProject("av-generic-membership");
    ({ orgId, cleanup } = isolated);
    adminToken = isolated.authToken;
    projectId = await createAgentVaultProject({ authToken: adminToken, name: `av-generic-membership-${Date.now()}` });
    // A Member role as the role migration makes one, which the legacy `member` and `viewer` here name.
    await convertAgentVaultMemberRows(projectId);

    const role = await asAdmin("POST", `/api/v1/projects/${projectId}/roles`, {
      slug: "membership-manager",
      name: "membership-manager",
      permissions: [
        { subject: "member", action: ["read", "create", "edit", "delete", "assign-role"] },
        { subject: "identity", action: ["read", "create", "edit", "delete", "assign-role"] },
        { subject: "groups", action: ["read", "create", "edit", "delete", "assign-role"] }
      ]
    });
    expect(role.statusCode, role.payload).toBe(200);

    const manager = await createIdentityActor({ orgId, authToken: adminToken, name: `av-manager-${Date.now()}` });
    managerToken = manager.authToken;
    managerIdentityId = manager.identityId;
    const added = await asAdmin("POST", identityPath(manager.identityId), {
      roles: [{ role: "membership-manager" }]
    });
    expect(added.statusCode, added.payload).toBe(200);
  });

  afterAll(async () => {
    await deleteUsers(userIds);
    await deleteAgentVaultProject({ authToken: adminToken, projectId });
    await cleanup();
  });

  describe("only an Agent Vault admin can make or unmake an admin", () => {
    test("a machine identity can't be added or promoted as an admin by a role that assigns roles, only by an admin", async () => {
      const target = await createOrgIdentity("av-generic-target");

      const added = await asManager("POST", identityPath(target), { roles: [{ role: ProjectMembershipRole.Admin }] });
      expect(added.statusCode).toBe(403);
      expect(added.json().message).toBe(GIVE_ADMIN);

      // The rule is about admin alone: the same role still gives the roles it may.
      const addedAsManager = await asManager("POST", identityPath(target), { roles: [{ role: "membership-manager" }] });
      expect(addedAsManager.statusCode, addedAsManager.payload).toBe(200);

      const promoted = await asManager("PATCH", identityPath(target), { roles: [{ role: ProjectMembershipRole.Admin }] });
      expect(promoted.statusCode).toBe(403);
      expect(promoted.json().message).toBe(GIVE_ADMIN);

      const byAdmin = await asAdmin("PATCH", identityPath(target), { roles: [{ role: ProjectMembershipRole.Admin }] });
      expect(byAdmin.statusCode, byAdmin.payload).toBe(200);
      const membership = await projectMembershipOf({ actorIdentityId: target });
      expect(await roleSlugsOf(membership.id)).toEqual([ProjectMembershipRole.Admin]);
    });

    test("an admin machine identity can't have its roles changed or be removed by anyone but an admin", async () => {
      const target = await createOrgIdentity("av-generic-admin");
      const added = await asAdmin("POST", identityPath(target), { roles: [{ role: ProjectMembershipRole.Admin }] });
      expect(added.statusCode, added.payload).toBe(200);

      const demoted = await asManager("PATCH", identityPath(target), { roles: [{ role: "membership-manager" }] });
      expect(demoted.statusCode).toBe(403);
      expect(demoted.json().message).toBe(TOUCH_ADMIN);

      const removed = await asManager("DELETE", identityPath(target));
      expect(removed.statusCode).toBe(403);
      expect(removed.json().message).toBe(TOUCH_ADMIN);

      const membership = await projectMembershipOf({ actorIdentityId: target });
      expect(await roleSlugsOf(membership.id)).toEqual([ProjectMembershipRole.Admin]);

      const removedByAdmin = await asAdmin("DELETE", identityPath(target));
      expect(removedByAdmin.statusCode, removedByAdmin.payload).toBe(200);
    });

    test("the user routes keep the same rule", async () => {
      const membershipId = await createProjectUser(ProjectMembershipRole.NoAccess);
      const userPath = `/api/v1/projects/${projectId}/memberships/${membershipId}`;

      const promoted = await asManager("PATCH", userPath, { roles: [{ role: ProjectMembershipRole.Admin }] });
      expect(promoted.statusCode).toBe(403);
      expect(promoted.json().message).toBe(GIVE_ADMIN);

      await testDb(TableName.MembershipRole).where({ membershipId }).update({ role: ProjectMembershipRole.Admin });

      const demoted = await asManager("PATCH", userPath, { roles: [{ role: "membership-manager" }] });
      expect(demoted.statusCode).toBe(403);
      expect(demoted.json().message).toBe(TOUCH_ADMIN);

      const removed = await asManager("DELETE", userPath);
      expect(removed.statusCode).toBe(403);
      expect(removed.json().message).toBe(TOUCH_ADMIN);
      expect(await roleSlugsOf(membershipId)).toEqual([ProjectMembershipRole.Admin]);
    });

    test("the bulk user removal routes keep the same rule", async () => {
      const { userId, username } = await createUser("av-generic-bulk");
      userIds.push(userId);
      await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
      const membershipId = await addUserMembership({ userId, orgId, projectId, role: ProjectMembershipRole.Admin });

      for (const url of [`/api/v1/projects/${projectId}/memberships`, `/api/v2/workspace/${projectId}/memberships`]) {
        // eslint-disable-next-line no-await-in-loop
        const removed = await asManager("DELETE", url, { usernames: [username] });
        expect(removed.statusCode).toBe(403);
        expect(removed.json().message).toBe(TOUCH_ADMIN);
      }
      expect(await roleSlugsOf(membershipId)).toEqual([ProjectMembershipRole.Admin]);

      const removedByAdmin = await asAdmin("DELETE", `/api/v1/projects/${projectId}/memberships`, {
        usernames: [username]
      });
      expect(removedByAdmin.statusCode, removedByAdmin.payload).toBe(200);
    });

    test("the group routes keep the same rule", async () => {
      const restoreLicense = overrideLicenseFeatures({ groups: true });
      try {
        const group = await asAdmin("POST", "/api/v1/groups", {
          name: `av-generic-group-${Date.now()}`,
          role: OrgMembershipRole.NoAccess
        });
        expect(group.statusCode, group.payload).toBe(200);
        const groupPath = `/api/v1/projects/${projectId}/memberships/groups/${group.json().id as string}`;

        const added = await asManager("POST", groupPath, { roles: [{ role: ProjectMembershipRole.Admin }] });
        expect(added.statusCode).toBe(403);
        expect(added.json().message).toBe(GIVE_ADMIN);

        const byAdmin = await asAdmin("POST", groupPath, { roles: [{ role: ProjectMembershipRole.Admin }] });
        expect(byAdmin.statusCode, byAdmin.payload).toBe(200);

        const demoted = await asManager("PATCH", groupPath, { roles: [{ role: "membership-manager" }] });
        expect(demoted.statusCode).toBe(403);
        expect(demoted.json().message).toBe(TOUCH_ADMIN);

        const removed = await asManager("DELETE", groupPath);
        expect(removed.statusCode).toBe(403);
        expect(removed.json().message).toBe(TOUCH_ADMIN);
      } finally {
        restoreLicense();
      }
    });

    test("a machine identity made in the project is made an admin only by an admin", async () => {
      const path = `/api/v1/projects/${projectId}/identities`;
      const body = (name: string) => ({ name: `${name}-${Date.now()}`, roles: [{ role: ProjectMembershipRole.Admin }] });

      const byManager = await asManager("POST", path, body("av-generic-project-identity"));
      expect(byManager.statusCode).toBe(403);
      expect(byManager.json().message).toBe(GIVE_ADMIN);

      const byAdmin = await asAdmin("POST", path, body("av-generic-project-admin"));
      expect(byAdmin.statusCode, byAdmin.payload).toBe(200);

      // Deleting a machine identity made in the project removes its admin role with it.
      const adminIdentityId = byAdmin.json().identity.id as string;
      const deletedByManager = await asManager("DELETE", `${path}/${adminIdentityId}`);
      expect(deletedByManager.statusCode).toBe(403);
      expect(deletedByManager.json().message).toBe("Only an Agent Vault admin can change or remove another admin.");
      const deletedByAdmin = await asAdmin("DELETE", `${path}/${adminIdentityId}`);
      expect(deletedByAdmin.statusCode, deletedByAdmin.payload).toBe(200);
    });

    test("a machine identity made in the project without roles gets No Access, like an invitee", async () => {
      const path = `/api/v1/projects/${projectId}/identities`;
      const role = await asAdmin("POST", `/api/v1/projects/${projectId}/roles`, {
        slug: `identity-creator-${Date.now()}`,
        name: "identity-creator",
        permissions: [{ subject: "identity", action: ["read", "create"] }]
      });
      expect(role.statusCode, role.payload).toBe(200);
      const creator = await createIdentityActor({ orgId, authToken: adminToken, name: `av-creator-${Date.now()}` });
      const added = await asAdmin("POST", identityPath(creator.identityId), {
        roles: [{ role: role.json().role.slug }]
      });
      expect(added.statusCode, added.payload).toBe(200);
      const asCreator = requester(() => creator.authToken);

      for (const create of [asCreator, asAdmin]) {
        // eslint-disable-next-line no-await-in-loop
        const created = await create("POST", path, { name: `av-generic-default-${Date.now()}` });
        expect(created.statusCode, created.payload).toBe(200);
        // eslint-disable-next-line no-await-in-loop
        const membership = await projectMembershipOf({ actorIdentityId: created.json().identity.id as string });
        // eslint-disable-next-line no-await-in-loop
        expect(await roleSlugsOf(membership.id)).toEqual([ProjectMembershipRole.NoAccess]);
      }
    });

    test("a change or removal waiting on the lock is refused when the member was made an admin meanwhile", async () => {
      const target = await createOrgIdentity("av-generic-stale");
      const added = await asAdmin("POST", identityPath(target), { roles: [{ role: "membership-manager" }] });
      expect(added.statusCode, added.payload).toBe(200);
      const membership = await projectMembershipOf({ actorIdentityId: target });
      // The bulk removal names users only.
      const { userId, username } = await createUser("av-generic-stale-user");
      userIds.push(userId);
      await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });
      const userMembershipId = await addUserMembership({ userId, orgId, projectId, role: ProjectMembershipRole.NoAccess });
      const projectIdentity = await asAdmin("POST", `/api/v1/projects/${projectId}/identities`, {
        name: `av-generic-stale-project-${Date.now()}`,
        roles: [{ role: "membership-manager" }]
      });
      expect(projectIdentity.statusCode, projectIdentity.payload).toBe(200);
      const projectIdentityId = projectIdentity.json().identity.id as string;
      const projectIdentityMembership = await projectMembershipOf({ actorIdentityId: projectIdentityId });

      const changes = [
        {
          membershipId: membership.id,
          run: () => asManager("PATCH", identityPath(target), { roles: [{ role: ProjectMembershipRole.NoAccess }] })
        },
        { membershipId: membership.id, run: () => asManager("DELETE", identityPath(target)) },
        {
          membershipId: userMembershipId,
          run: () => asManager("DELETE", `/api/v1/projects/${projectId}/memberships`, { usernames: [username] })
        },
        {
          membershipId: projectIdentityMembership.id,
          run: () => asManager("DELETE", `/api/v1/projects/${projectId}/identities/${projectIdentityId}`)
        }
      ];
      for (const change of changes) {
        // An admin promotes the member while the manager's change waits for the project's member-change lock.
        // eslint-disable-next-line no-await-in-loop
        const trx = await testDb.transaction();
        let pending: ReturnType<typeof change.run> | undefined;
        try {
          // eslint-disable-next-line no-await-in-loop
          const { rows } = await trx.raw("select pg_backend_pid() as pid");
          // eslint-disable-next-line no-await-in-loop
          await trx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.LastAdminGuard("project", projectId)]);
          // eslint-disable-next-line no-await-in-loop
          const [promotion] = (await trx(TableName.MembershipRole)
            .insert({ membershipId: change.membershipId, role: ProjectMembershipRole.Admin })
            .returning("id")) as { id: string }[];
          pending = change.run();
          // eslint-disable-next-line no-await-in-loop
          await waitUntilBlockedBy(rows[0].pid);
          // eslint-disable-next-line no-await-in-loop
          await trx.commit();

          // eslint-disable-next-line no-await-in-loop
          const res = await pending;
          expect(res.statusCode).toBe(403);
          expect(res.json().message).toBe(TOUCH_ADMIN);
          // eslint-disable-next-line no-await-in-loop
          await testDb(TableName.MembershipRole).where({ id: promotion.id }).delete();
        } catch (err) {
          // eslint-disable-next-line no-await-in-loop
          if (!trx.isCompleted()) await trx.rollback();
          // eslint-disable-next-line no-await-in-loop
          await pending?.catch(() => undefined);
          throw err;
        }
      }
      expect(await roleSlugsOf(membership.id)).toEqual(["membership-manager"]);
      expect(await roleSlugsOf(userMembershipId)).toEqual([ProjectMembershipRole.NoAccess]);
      expect(await roleSlugsOf(projectIdentityMembership.id)).toEqual(["membership-manager"]);
    });

    test("a change or removal waiting on the lock starts over when the member got another role meanwhile", async () => {
      const target = await createOrgIdentity("av-generic-changed");
      const added = await asAdmin("POST", identityPath(target), { roles: [{ role: "membership-manager" }] });
      expect(added.statusCode, added.payload).toBe(200);
      const membership = await projectMembershipOf({ actorIdentityId: target });
      const userMembershipId = await createProjectUser(ProjectMembershipRole.NoAccess);
      const userPath = `/api/v1/projects/${projectId}/memberships/${userMembershipId}`;

      const changes = [
        {
          membershipId: membership.id,
          run: () => asManager("PATCH", identityPath(target), { roles: [{ role: ProjectMembershipRole.NoAccess }] })
        },
        { membershipId: membership.id, run: () => asManager("DELETE", identityPath(target)) },
        {
          membershipId: userMembershipId,
          run: () => asManager("PATCH", userPath, { roles: [{ role: "membership-manager" }] })
        },
        { membershipId: userMembershipId, run: () => asManager("DELETE", userPath) }
      ];
      for (const change of changes) {
        let givenMeanwhile: string | undefined;
        // eslint-disable-next-line no-await-in-loop
        const res = await runBehindLock(change.run, async (trx) => {
          // An admin gives the member the Member role while the manager's change waits for the lock. The guard checked
          // the roles the member held before it, so the change has to start over.
          const [row] = (await trx(TableName.MembershipRole)
            .insert({
              membershipId: change.membershipId,
              role: ProjectMembershipRole.Custom,
              customRoleId: agentVaultMemberRoleIdOf(projectId)
            })
            .returning("id")) as { id: string }[];
          givenMeanwhile = row.id;
        });
        expect(res.statusCode, res.payload).toBe(409);
        expect(res.json().message).toBe(ROLES_CHANGED);
        // eslint-disable-next-line no-await-in-loop
        await testDb(TableName.MembershipRole).where({ id: givenMeanwhile }).delete();
      }
      expect(await roleSlugsOf(membership.id)).toEqual(["membership-manager"]);
      expect(await roleSlugsOf(userMembershipId)).toEqual([ProjectMembershipRole.NoAccess]);
    });

    test("an admin's change waits for the project's role-change lock too", async () => {
      const target = await createOrgIdentity("av-generic-admin-lock");
      const added = await asAdmin("POST", identityPath(target), { roles: [{ role: "membership-manager" }] });
      expect(added.statusCode, added.payload).toBe(200);

      // A grant that holds the lock would otherwise read the member's roles before this change and write after it.
      const promoted = await runBehindLock(() =>
        asAdmin("PATCH", identityPath(target), { roles: [{ role: ProjectMembershipRole.Admin }] })
      );
      expect(promoted.statusCode, promoted.payload).toBe(200);
      const membership = await projectMembershipOf({ actorIdentityId: target });
      expect(await roleSlugsOf(membership.id)).toEqual([ProjectMembershipRole.Admin]);
    });

    test("an Admin assignment that already ended doesn't stop a manager changing the member", async () => {
      const target = await createOrgIdentity("av-generic-ended-admin");
      const added = await asAdmin("POST", identityPath(target), { roles: [{ role: "membership-manager" }] });
      expect(added.statusCode, added.payload).toBe(200);
      const membership = await projectMembershipOf({ actorIdentityId: target });
      await testDb(TableName.MembershipRole).insert({
        membershipId: membership.id,
        role: ProjectMembershipRole.Admin,
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: "1h",
        temporaryAccessStartTime: new Date(Date.now() - 7_200_000),
        temporaryAccessEndTime: new Date(Date.now() - 3_600_000)
      });

      const updated = await asManager("PATCH", identityPath(target), { roles: [{ role: ProjectMembershipRole.NoAccess }] });
      expect(updated.statusCode, updated.payload).toBe(200);
      expect(await roleSlugsOf(membership.id)).toEqual([ProjectMembershipRole.NoAccess]);
    });

    test("member is refused on a project without a Member role", async () => {
      const bare = await createAgentVaultProject({ authToken: adminToken, name: `av-generic-bare-${Date.now()}` });
      try {
        const identityId = await createOrgIdentity("av-generic-bare-member");
        const res = await asAdmin("POST", `/api/v1/projects/${bare}/memberships/identities/${identityId}`, {
          roles: [{ role: ProjectMembershipRole.Member }]
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toBe(
          "This project has no role 'member'. Use admin, no-access, or the slug of one of the project's roles."
        );
      } finally {
        await deleteAgentVaultProject({ authToken: adminToken, projectId: bare });
      }
    });
  });

  describe("nobody but an admin acts as an admin", () => {
    const ADMIN_IDENTITY_AUTH =
      "Only an Agent Vault admin can manage the credentials or authentication of a machine identity that has the Admin role.";

    test("assuming another member's privileges is refused in Agent Vault, even for an admin", async () => {
      const res = await asAdmin("POST", `/api/v1/projects/${projectId}/assume-privileges`, {
        actorType: "identity",
        actorId: managerIdentityId
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Agent Vault projects don't support assuming another member's privileges.");
    });

    test("only an admin manages the auth of a machine identity that holds Admin", async () => {
      const role = await asAdmin("POST", `/api/v1/projects/${projectId}/roles`, {
        slug: `credential-manager-${Date.now()}`,
        name: "credential-manager",
        permissions: [
          {
            subject: "identity",
            action: ["read", "edit-auth", "revoke-auth", "create-token", "get-token", "delete-token"]
          }
        ]
      });
      expect(role.statusCode, role.payload).toBe(200);
      const credentialManager = await createIdentityActor({
        orgId,
        authToken: adminToken,
        name: `av-credential-manager-${Date.now()}`
      });
      const added = await asAdmin("POST", identityPath(credentialManager.identityId), {
        roles: [{ role: role.json().role.slug }]
      });
      expect(added.statusCode, added.payload).toBe(200);
      const asCredentialManager = requester(() => credentialManager.authToken);

      const makeProjectIdentity = async (name: string, roleSlug: string) => {
        const created = await asAdmin("POST", `/api/v1/projects/${projectId}/identities`, {
          name: `${name}-${Date.now()}`,
          roles: [{ role: roleSlug }]
        });
        expect(created.statusCode, created.payload).toBe(200);
        return created.json().identity.id as string;
      };
      const attachBody = { accessTokenTTL: 3600, accessTokenMaxTTL: 3600, accessTokenNumUsesLimit: 0 };
      const adminIdentity = await makeProjectIdentity("av-auth-admin", ProjectMembershipRole.Admin);
      const otherIdentity = await makeProjectIdentity("av-auth-other", "membership-manager");

      const onAdmin = await asCredentialManager("POST", `/api/v1/auth/universal-auth/identities/${adminIdentity}`, attachBody);
      expect(onAdmin.statusCode).toBe(403);
      expect(onAdmin.json().message).toBe(ADMIN_IDENTITY_AUTH);

      const onOther = await asCredentialManager("POST", `/api/v1/auth/universal-auth/identities/${otherIdentity}`, attachBody);
      expect(onOther.statusCode, onOther.payload).toBe(200);

      const byAdmin = await asAdmin("POST", `/api/v1/auth/universal-auth/identities/${adminIdentity}`, attachBody);
      expect(byAdmin.statusCode, byAdmin.payload).toBe(200);
      const secret = await asCredentialManager(
        "POST",
        `/api/v1/auth/universal-auth/identities/${adminIdentity}/client-secrets`,
        {}
      );
      expect(secret.statusCode).toBe(403);
      expect(secret.json().message).toBe(ADMIN_IDENTITY_AUTH);
    });

    test("Join as Admin waits for the project's role-change lock", async () => {
      const joined = await runBehindLock(() =>
        asAdmin("POST", `/api/v1/organization-admin/projects/${projectId}/grant-admin-access`)
      );
      expect(joined.statusCode, joined.payload).toBe(200);
    });
  });

  describe("an Agent Vault project's name and delete protection go by edit on the project", () => {
    test("edit on settings alone can't rename it, and edit on the project can", async () => {
      const roleFor = async (slug: string, permissions: Record<string, unknown>[]) => {
        const res = await asAdmin("POST", `/api/v1/projects/${projectId}/roles`, { slug, name: slug, permissions });
        expect(res.statusCode, res.payload).toBe(200);
        return slug;
      };
      const actorWith = async (roleSlug: string) => {
        const actor = await createIdentityActor({ orgId, authToken: adminToken, name: `${roleSlug}-actor` });
        const added = await asAdmin("POST", identityPath(actor.identityId), { roles: [{ role: roleSlug }] });
        expect(added.statusCode, added.payload).toBe(200);
        return requester(() => actor.authToken);
      };
      const stamp = Date.now();
      const settingsOnly = await actorWith(
        await roleFor(`settings-editor-${stamp}`, [{ subject: "settings", action: ["read", "edit"] }])
      );
      const projectEditor = await actorWith(
        await roleFor(`project-editor-${stamp}`, [{ subject: "workspace", action: ["edit"] }])
      );

      const bySettings = await settingsOnly("PATCH", `/api/v1/projects/${projectId}`, { name: `renamed-${stamp}` });
      expect(bySettings.statusCode).toBe(403);
      const byProject = await projectEditor("PATCH", `/api/v1/projects/${projectId}`, { name: `renamed-${stamp}` });
      expect(byProject.statusCode, byProject.payload).toBe(200);
    });
  });

  describe("member responses name each role", () => {
    test("each role comes with its name, built-in ones included", async () => {
      const res = await asAdmin("GET", `/api/v1/agent-vault/members?projectId=${projectId}&limit=100`);
      expect(res.statusCode, res.payload).toBe(200);
      const members = res.json().members as { id: string; roles: string[]; roleDetails: { slug: string; name: string }[] }[];
      const manager = members.find((member) => member.id === managerIdentityId);
      expect(manager?.roleDetails).toEqual([{ slug: "membership-manager", name: "membership-manager" }]);
      const admin = members.find((member) => member.roles.includes(ProjectMembershipRole.Admin));
      expect(admin?.roleDetails).toEqual([{ slug: ProjectMembershipRole.Admin, name: "Admin" }]);
    });
  });

  describe("nobody changes their own roles here, as on the members API", () => {
    test("a machine identity can't change its own roles", async () => {
      const res = await asManager("PATCH", identityPath(managerIdentityId), {
        roles: [{ role: ProjectMembershipRole.NoAccess }]
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toBe(OWN_ROLE);
      const membership = await projectMembershipOf({ actorIdentityId: managerIdentityId });
      expect(await roleSlugsOf(membership.id)).toEqual(["membership-manager"]);
    });

    test("a machine identity can't get past the check by sending its own id in uppercase", async () => {
      const res = await asManager("PATCH", identityPath(managerIdentityId.toUpperCase()), {
        roles: [{ role: ProjectMembershipRole.NoAccess }]
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toBe(OWN_ROLE);
      const membership = await projectMembershipOf({ actorIdentityId: managerIdentityId });
      expect(await roleSlugsOf(membership.id)).toEqual(["membership-manager"]);
    });

    test("a user can't change their own roles, an admin included", async () => {
      const membership = await projectMembershipOf({ actorUserId: seedData1.id });
      const res = await asAdmin("PATCH", `/api/v1/projects/${projectId}/memberships/${membership.id}`, {
        roles: [{ role: ProjectMembershipRole.Admin }, { role: "membership-manager" }]
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toBe(OWN_ROLE);
      expect(await roleSlugsOf(membership.id)).toEqual([ProjectMembershipRole.Admin]);
    });
  });

  describe("an older client's member keeps the member's access bundle roles", () => {
    let bundleRoleSlug: string;
    let bundleRoleId: string;

    beforeAll(async () => {
      const bundle = await asAdmin("POST", "/api/v1/agent-vault/access-bundles", { projectId, name: "generic-keep" });
      expect(bundle.statusCode, bundle.payload).toBe(200);
      const accessBundleId = bundle.json().accessBundle.id as string;

      // The bundle's own role, as the role migration and the deprecated grant endpoints make it.
      const [role] = (await testDb(TableName.Role)
        .insert({
          projectId,
          slug: "generic-keep-users",
          name: "generic-keep users",
          permissions: JSON.stringify([["read,use", "agent-vault-access-bundles", { accessBundleId }]])
        })
        .returning(["id", "slug"])) as { id: string; slug: string }[];
      await testDb(TableName.AgentVaultAccessBundle).where({ id: accessBundleId }).update({ grantRoleId: role.id });
      bundleRoleId = role.id;
      bundleRoleSlug = role.slug;
    });

    const memberRoleSlug = async () =>
      ((await testDb(TableName.Role).where({ projectId, name: "Member" }).first()) as { slug: string }).slug;

    const holdBundleRole = (membershipId: string) =>
      testDb(TableName.MembershipRole).insert({
        membershipId,
        role: ProjectMembershipRole.Custom,
        customRoleId: bundleRoleId
      });

    test("on the machine identity routes, member or viewer keeps the bundle role and a named role list replaces it", async () => {
      const target = await createOrgIdentity("av-generic-legacy");
      const added = await asAdmin("POST", identityPath(target), { roles: [{ role: ProjectMembershipRole.Member }] });
      expect(added.statusCode, added.payload).toBe(200);
      const membership = await projectMembershipOf({ actorIdentityId: target });
      await holdBundleRole(membership.id);

      const keepsBundleRole = async (legacy: ProjectMembershipRole) => {
        const updated = await asAdmin("PATCH", identityPath(target), { roles: [{ role: legacy }] });
        expect(updated.statusCode, updated.payload).toBe(200);
        expect(await roleSlugsOf(membership.id)).toEqual([bundleRoleSlug, await memberRoleSlug()].sort());
      };
      await keepsBundleRole(ProjectMembershipRole.Viewer);
      await keepsBundleRole(ProjectMembershipRole.Member);

      const named = await asAdmin("PATCH", identityPath(target), { roles: [{ role: "membership-manager" }] });
      expect(named.statusCode, named.payload).toBe(200);
      expect(await roleSlugsOf(membership.id)).toEqual(["membership-manager"]);
    });

    test("on the user routes, member keeps the bundle role", async () => {
      const membershipId = await createProjectUser(ProjectMembershipRole.NoAccess);
      await testDb(TableName.MembershipRole).where({ membershipId }).delete();
      await holdBundleRole(membershipId);

      const updated = await asAdmin("PATCH", `/api/v1/projects/${projectId}/memberships/${membershipId}`, {
        roles: [{ role: ProjectMembershipRole.Member }]
      });
      expect(updated.statusCode, updated.payload).toBe(200);
      expect(await roleSlugsOf(membershipId)).toEqual([bundleRoleSlug, await memberRoleSlug()].sort());
    });
  });

  describe("the Agent Vault members API's role limits hold here too", () => {
    const NO_ACCESS_ALONE = "No Access can't be given together with another role.";

    test("No Access can't sit beside another role, on the identity, user and group routes", async () => {
      const mixed = [{ role: ProjectMembershipRole.NoAccess }, { role: "membership-manager" }];

      const identityId = await createOrgIdentity("av-generic-limits");
      const added = await asAdmin("POST", identityPath(identityId), { roles: mixed });
      expect(added.statusCode).toBe(400);
      expect(added.json().message).toBe(NO_ACCESS_ALONE);

      const membershipId = await createProjectUser(ProjectMembershipRole.NoAccess);
      const updated = await asAdmin("PATCH", `/api/v1/projects/${projectId}/memberships/${membershipId}`, {
        roles: mixed
      });
      expect(updated.statusCode).toBe(400);
      expect(updated.json().message).toBe(NO_ACCESS_ALONE);

      const restoreLicense = overrideLicenseFeatures({ groups: true });
      try {
        const group = await asAdmin("POST", "/api/v1/groups", {
          name: `av-generic-limits-group-${Date.now()}`,
          role: OrgMembershipRole.NoAccess
        });
        expect(group.statusCode, group.payload).toBe(200);
        const groupAdded = await asAdmin(
          "POST",
          `/api/v1/projects/${projectId}/memberships/groups/${group.json().id as string}`,
          { roles: mixed }
        );
        expect(groupAdded.statusCode).toBe(400);
        expect(groupAdded.json().message).toBe(NO_ACCESS_ALONE);
      } finally {
        restoreLicense();
      }
    });

    test("a role sent more than once is given once", async () => {
      const identityId = await createOrgIdentity("av-generic-repeats");
      const added = await asAdmin("POST", identityPath(identityId), {
        roles: Array.from({ length: 12 }, () => ({ role: ProjectMembershipRole.NoAccess }))
      });
      expect(added.statusCode, added.payload).toBe(200);
      const membership = await projectMembershipOf({ actorIdentityId: identityId });
      expect(await roleSlugsOf(membership.id)).toEqual([ProjectMembershipRole.NoAccess]);

      const updated = await asAdmin("PATCH", identityPath(identityId), {
        roles: [{ role: "membership-manager" }, { role: "membership-manager" }]
      });
      expect(updated.statusCode, updated.payload).toBe(200);
      expect(await roleSlugsOf(membership.id)).toEqual(["membership-manager"]);
    });

    test("a member holds at most 10 roles", async () => {
      const slugs: string[] = [];
      for (let i = 0; i < 11; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const role = await asAdmin("POST", `/api/v1/projects/${projectId}/roles`, {
          slug: `generic-limit-${i}-${Date.now()}`,
          name: `generic-limit-${i}`,
          permissions: [{ subject: "agent-vault-sessions", action: ["read"] }]
        });
        expect(role.statusCode, role.payload).toBe(200);
        slugs.push(role.json().role.slug as string);
      }
      const identityId = await createOrgIdentity("av-generic-ten");
      const added = await asAdmin("POST", identityPath(identityId), { roles: [{ role: slugs[0] }] });
      expect(added.statusCode, added.payload).toBe(200);

      const tooMany = await asAdmin("PATCH", identityPath(identityId), { roles: slugs.map((role) => ({ role })) });
      expect(tooMany.statusCode).toBe(400);
      expect(tooMany.json().message).toBe("A member can have at most 10 roles.");
      const membership = await projectMembershipOf({ actorIdentityId: identityId });
      expect(await roleSlugsOf(membership.id)).toEqual([slugs[0]]);
    });

    test("a role can't be given for a limited time", async () => {
      const TEMPORARY = "Agent Vault doesn't support temporary roles yet. Give the role without a time limit.";
      const extra = await asAdmin("POST", `/api/v1/projects/${projectId}/roles`, {
        slug: `generic-temporary-${Date.now()}`,
        name: "generic-temporary",
        permissions: [{ subject: "agent-vault-sessions", action: ["read"] }]
      });
      expect(extra.statusCode, extra.payload).toBe(200);
      const temporary = {
        role: extra.json().role.slug as string,
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: "1h",
        temporaryAccessStartTime: new Date().toISOString()
      };
      const identityId = await createOrgIdentity("av-generic-temporary");
      const added = await asAdmin("POST", identityPath(identityId), {
        roles: [{ role: "membership-manager" }, temporary]
      });
      expect(added.statusCode).toBe(400);
      expect(added.json().message).toBe(TEMPORARY);
      expect(await testDb(TableName.Membership).where({ scopeProjectId: projectId, actorIdentityId: identityId })).toEqual(
        []
      );

      const permanent = await asAdmin("POST", identityPath(identityId), { roles: [{ role: "membership-manager" }] });
      expect(permanent.statusCode, permanent.payload).toBe(200);
      const updated = await asAdmin("PATCH", identityPath(identityId), {
        roles: [{ role: "membership-manager" }, temporary]
      });
      expect(updated.statusCode).toBe(400);
      expect(updated.json().message).toBe(TEMPORARY);
      const membership = await projectMembershipOf({ actorIdentityId: identityId });
      const [row] = await testDb(TableName.MembershipRole).where({ membershipId: membership.id });
      expect(row).toMatchObject({ isTemporary: false, temporaryAccessEndTime: null });
    });

    test("another product's built-in role is refused, since Agent Vault resolves none of them", async () => {
      const noSuchRole = (role: string) =>
        `This project has no role '${role}'. Use admin, no-access, or the slug of one of the project's roles.`;
      const identityId = await createOrgIdentity("av-generic-built-in");
      for (const role of [ProjectMembershipRole.Custom, ProjectMembershipRole.KmsCryptographicOperator]) {
        // eslint-disable-next-line no-await-in-loop
        const added = await asAdmin("POST", identityPath(identityId), { roles: [{ role }] });
        expect(added.statusCode).toBe(400);
        expect(added.json().message).toBe(noSuchRole(role));
      }
      expect(await testDb(TableName.Membership).where({ scopeProjectId: projectId, actorIdentityId: identityId })).toEqual(
        []
      );

      const membershipId = await createProjectUser(ProjectMembershipRole.NoAccess);
      const updated = await asAdmin("PATCH", `/api/v1/projects/${projectId}/memberships/${membershipId}`, {
        roles: [{ role: ProjectMembershipRole.KmsCryptographicOperator }]
      });
      expect(updated.statusCode).toBe(400);
      expect(updated.json().message).toBe(noSuchRole(ProjectMembershipRole.KmsCryptographicOperator));
      expect(await roleSlugsOf(membershipId)).toEqual([ProjectMembershipRole.NoAccess]);
    });
  });

  describe("the deprecated route that adds users as Member", () => {
    test("refuses an Agent Vault project, where Member grants nothing", async () => {
      const { userId } = await createUser("av-generic-deprecated-add");
      userIds.push(userId);
      const orgMembershipId = await addUserMembership({ userId, orgId, role: OrgMembershipRole.Member });

      const res = await asAdmin("POST", `/api/v1/workspace/${projectId}/memberships`, {
        members: [{ orgMembershipId, workspaceEncryptedKey: "key", workspaceEncryptedNonce: "nonce" }]
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe(
        "This route can't add members to an Agent Vault project. Use POST /api/v1/agent-vault/members instead."
      );
      expect(
        await testDb(TableName.Membership).where({ scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: userId })
      ).toHaveLength(0);
    });
  });

  describe("the deprecated role field names the Member role by its id", () => {
    const deprecatedRoleIn = async (inProjectId: string, identityId: string) => {
      const listed = await asAdmin("GET", `/api/v1/agent-vault/members?projectId=${inProjectId}&limit=100`);
      expect(listed.statusCode, listed.payload).toBe(200);
      return (listed.json().members as { id: string; role: string; roles: string[] }[]).find(
        (member) => member.id === identityId
      );
    };

    test("a renamed Member role still reads as member", async () => {
      const identityId = await createOrgIdentity("av-generic-renamed");
      const added = await asAdmin("POST", "/api/v1/agent-vault/members", {
        projectId,
        machineIdentityIds: [identityId],
        roles: [ProjectMembershipRole.Member]
      });
      expect(added.statusCode, added.payload).toBe(200);

      const memberRole = TableName.Role;
      const { slug } = (await testDb(memberRole).where({ id: agentVaultMemberRoleIdOf(projectId) }).first()) as {
        slug: string;
      };
      try {
        await testDb(memberRole).where({ id: agentVaultMemberRoleIdOf(projectId) }).update({ slug: "renamed-member" });
        expect(await deprecatedRoleIn(projectId, identityId)).toMatchObject({
          role: ProjectMembershipRole.Member,
          roles: ["renamed-member"]
        });
      } finally {
        await testDb(memberRole).where({ id: agentVaultMemberRoleIdOf(projectId) }).update({ slug });
      }
    });

    test("another role with the slug member-role reads as itself", async () => {
      const bare = await createAgentVaultProject({ authToken: adminToken, name: `av-generic-lookalike-${Date.now()}` });
      try {
        const role = await asAdmin("POST", `/api/v1/projects/${bare}/roles`, {
          slug: "member-role",
          name: "Looks like Member",
          permissions: [{ subject: "agent-vault-sessions", action: ["read"] }]
        });
        expect(role.statusCode, role.payload).toBe(200);
        const identityId = await createOrgIdentity("av-generic-lookalike");
        const added = await asAdmin("POST", "/api/v1/agent-vault/members", {
          projectId: bare,
          machineIdentityIds: [identityId],
          roles: ["member-role"]
        });
        expect(added.statusCode, added.payload).toBe(200);
        expect(added.json().members[0]).toMatchObject({ role: "member-role" });
        expect(await deprecatedRoleIn(bare, identityId)).toMatchObject({ role: "member-role", roles: ["member-role"] });
      } finally {
        await deleteAgentVaultProject({ authToken: adminToken, projectId: bare });
      }
    });
  });
});
