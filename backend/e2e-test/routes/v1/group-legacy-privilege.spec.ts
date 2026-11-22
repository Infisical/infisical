// New organizations use the new privilege system and no route turns it off, so the legacy system's
// role comparison is reached by writing the flag, as identity-auth-boundary.spec.ts does.
import { packRules } from "@casl/ability/extra";

import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";

import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";
import { createIdentityActor } from "e2e-test/testUtils/identities";
import { overrideLicenseFeatures } from "e2e-test/testUtils/license";
import { addUserMembership, createUser, deleteUsers } from "e2e-test/testUtils/users";

describe("Group membership on the legacy privilege system", () => {
  let orgId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  const users: string[] = [];
  let restoreLicense: () => void;

  beforeAll(async () => {
    restoreLicense = overrideLicenseFeatures({ groups: true });
    ({ orgId, authToken, cleanup } = await createIsolatedOrgAndProject("group-legacy-privilege"));
    await testDb(TableName.Organization).where({ id: orgId }).update({ shouldUseNewPrivilegeSystem: false });
  });

  afterAll(async () => {
    await cleanup();
    await deleteUsers(users);
    restoreLicense();
  });

  test("an actor cannot add a user to a group more privileged than itself", async () => {
    const actor = await createIdentityActor({ orgId, authToken, role: OrgMembershipRole.Member });
    const [role] = await testDb(TableName.Role)
      .insert({
        name: "group-editor",
        slug: `group-editor-${orgId.slice(0, 8)}`,
        orgId,
        permissions: JSON.stringify(
          packRules([{ subject: "groups", action: ["read", "edit", "add-members"] }] as never)
        )
      })
      .returning("id");
    const membership = await testDb(TableName.Membership)
      .where({ scope: AccessScope.Organization, scopeOrgId: orgId, actorIdentityId: actor.identityId })
      .first();
    await testDb(TableName.MembershipRole)
      .where({ membershipId: (membership as { id: string }).id })
      .delete();
    await testDb(TableName.MembershipRole).insert({
      membershipId: (membership as { id: string }).id,
      role: "custom",
      customRoleId: (role as { id: string }).id
    });

    const groupRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/groups",
      headers: { authorization: `Bearer ${authToken}` },
      body: { name: "admins", role: OrgMembershipRole.Admin }
    });
    expect(groupRes.statusCode, groupRes.payload).toBe(200);
    const groupId = groupRes.json().id as string;

    const user = await createUser("legacy-group-member");
    users.push(user.userId);
    await addUserMembership({ userId: user.userId, orgId, role: OrgMembershipRole.Member });

    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/groups/${groupId}/users/${encodeURIComponent(user.username)}`,
      headers: { authorization: `Bearer ${actor.authToken}` }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain("more privileged group");
    const members = await testDb(TableName.UserGroupMembership).where({ groupId });
    expect(members).toHaveLength(0);
  });
});
