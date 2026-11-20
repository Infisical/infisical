import crypto from "node:crypto";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const ORG_ID = seedData1.organization.id;

const newEmails = (count: number) => {
  const run = crypto.randomUUID().slice(0, 8);
  return Array.from({ length: count }, (_, i) => `invite-limits-${run}-${i}@example.com`);
};

const inviteToOrg = (inviteeEmails: string[], organizationRoleSlug = "member") =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/invite-org/signup",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { inviteeEmails, organizationId: ORG_ID, organizationRoleSlug }
  });

const countUsers = async (emails: string[]) => {
  const [{ count }] = await testDb(TableName.Users)
    .whereIn("username", emails)
    .count<{ count: string }[]>("id as count");
  return Number(count);
};

const removeInvitees = async (emails: string[]) => {
  const userIds = testDb(TableName.Users).whereIn("username", emails).select("id");
  await testDb(TableName.Membership)
    .where({ scope: AccessScope.Organization, scopeOrgId: ORG_ID })
    .whereIn("actorUserId", userIds)
    .delete();
  await testDb(TableName.Users).whereIn("username", emails).delete();
};

// Users are created only once nothing can refuse the invite, so a refused one leaves no account behind
// for addresses the inviter chose.
describe("Org invite refusals leave no users behind", () => {
  const used: string[] = [];

  afterAll(async () => {
    await removeInvitees(used);
  });

  test("an invite of more than ten new people is refused and creates no users", async () => {
    // Setup
    const emails = newEmails(11);
    used.push(...emails);

    // Action
    const res = await inviteToOrg(emails);

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("You can invite up to 10 new members at a time");
    expect(await countUsers(emails)).toBe(0);
  });

  test("an invite with a role that does not exist is refused and creates no users", async () => {
    // Setup
    const emails = newEmails(2);
    used.push(...emails);

    // Action
    const res = await inviteToOrg(emails, `no-such-role-${crypto.randomUUID().slice(0, 8)}`);

    // Assert
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(await countUsers(emails)).toBe(0);
  });

  test("an accepted invite creates one user per new address", async () => {
    // Setup
    const emails = newEmails(3);
    used.push(...emails);

    // Action
    const res = await inviteToOrg(emails);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(await countUsers(emails)).toBe(3);
  });
});
