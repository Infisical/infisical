/**
 * Resending an org invitation hands the caller a working signup link in the response when SMTP is
 * unset (as in this environment), so it has to be bounded the same way creating the invitation is:
 * a caller who cannot grant a role must not be able to resend, and so receive the link for, a
 * pending invitation to it.
 *
 * The caller is a user because the route only takes AuthMode.JWT.
 */

import { OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { overrideLicenseFeatures } from "../../testUtils/license";
import { addUserMembership, createUser, createUserAuthToken, deleteUsers } from "../../testUtils/users";

const asToken = (token: string) => ({ authorization: `Bearer ${token}` });

const resendInvitation = (membershipId: string, token: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/invite-org/signup-resend",
    headers: asToken(token),
    body: { membershipId }
  });

describe("Org invitation resend privilege boundary", () => {
  let org: Awaited<ReturnType<typeof createIsolatedOrgAndProject>>;
  let inviterToken: string;
  let invitee: { userId: string; username: string; membershipId: string };
  const createdUserIds: string[] = [];

  const setNewPrivilegeSystem = async (enabled: boolean) => {
    await testDb(TableName.Organization).where({ id: org.orgId }).update({ shouldUseNewPrivilegeSystem: enabled });
  };

  beforeAll(async () => {
    org = await createIsolatedOrgAndProject("e2e-invite-resend");

    // Holds member:create (what the route's own check demands) and nothing that grants a role.
    const roleSlug = "e2e-member-inviter";
    const restoreLicense = overrideLicenseFeatures({ rbac: true });
    const roleRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/organization/roles",
      headers: asToken(org.authToken),
      body: { slug: roleSlug, name: roleSlug, permissions: [{ subject: "member", action: ["read", "create"] }] }
    });
    restoreLicense();
    expect(roleRes.statusCode, roleRes.body).toBe(200);

    const inviter = await createUser("invite-resend-inviter");
    createdUserIds.push(inviter.userId);
    const inviterMembershipId = await addUserMembership({
      userId: inviter.userId,
      orgId: org.orgId,
      role: roleSlug as OrgMembershipRole
    });
    await testDb(TableName.MembershipRole)
      .where({ membershipId: inviterMembershipId })
      .update({ role: OrgMembershipRole.Custom, customRoleId: roleRes.json().role.id });
    inviterToken = await createUserAuthToken({ userId: inviter.userId, orgId: org.orgId });

    const pending = await createUser("invite-resend-invitee");
    createdUserIds.push(pending.userId);
    invitee = {
      ...pending,
      membershipId: await addUserMembership({
        userId: pending.userId,
        orgId: org.orgId,
        role: OrgMembershipRole.Admin,
        status: OrgMembershipStatus.Invited
      })
    };
  });

  afterAll(async () => {
    await deleteUsers(createdUserIds);
    await org.cleanup();
  });

  test.each([
    ["new", true],
    ["legacy", false]
  ])("a caller who cannot grant Admin cannot resend an Admin invitation (%s privilege system)", async (_, enabled) => {
    await setNewPrivilegeSystem(enabled);

    const res = await resendInvitation(invitee.membershipId, inviterToken);

    expect(res.statusCode).toBe(403);
    expect(res.json().signupToken).toBeUndefined();
  });

  test("an org admin can still resend the invitation", async () => {
    await setNewPrivilegeSystem(true);

    const res = await resendInvitation(invitee.membershipId, org.authToken);

    expect(res.statusCode).toBe(200);
    expect(res.json().signupToken).toMatchObject({
      email: invitee.username,
      link: expect.stringContaining("/signupinvite?token=")
    });
  });
});
