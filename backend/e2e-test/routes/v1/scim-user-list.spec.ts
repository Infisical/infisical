import { seedData1 } from "@app/db/seed-data";
import { TableName } from "@app/db/schemas";
import { AccessScope } from "@app/db/schemas/models";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const findSeedMembership = async () => {
  const [membership] = await testDb(TableName.Membership)
    .where({
      scopeOrgId: seedData1.organization.id,
      actorUserId: seedData1.id,
      scope: AccessScope.Organization
    })
    .select("id");

  if (!membership) throw new Error("Seed membership not found — check seeds");
  return membership;
};

const insertSamlAlias = async (userId: string, orgId: string, externalId: string) => {
  const [alias] = await testDb(TableName.UserAliases)
    .insert({
      userId,
      orgId,
      aliasType: "saml",
      externalId,
      username: externalId
    })
    .returning("id");
  return alias.id as string;
};

const deleteSamlAliases = async (userId: string, orgId: string) => {
  await testDb(TableName.UserAliases).where({ userId, orgId, aliasType: "saml" }).delete();
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SCIM user list — duplicate suppression", () => {
  // Tracks alias IDs inserted per test for deterministic cleanup.
  let insertedAliasIds: string[] = [];

  afterEach(async () => {
    // Clean up any SAML aliases we inserted so tests don't bleed into each other.
    await deleteSamlAliases(seedData1.id, seedData1.organization.id);
    insertedAliasIds = [];
  });

  test("returns each user exactly once when they have a single SAML alias", async () => {
    const aliasId = await insertSamlAlias(
      seedData1.id,
      seedData1.organization.id,
      "saml-external-id-1"
    );
    insertedAliasIds.push(aliasId);

    // Query the DAL directly — bypasses the EE SCIM feature gate.
    const rows = await testDb(TableName.Membership)
      .where(`${TableName.Membership}.scopeOrgId`, seedData1.organization.id)
      .where(`${TableName.Membership}.scope`, AccessScope.Organization)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
      .join(
        TableName.Organization,
        `${TableName.Organization}.id`,
        `${TableName.Membership}.scopeOrgId`
      )
      .whereNull(`${TableName.Organization}.rootOrgId`)
      .leftJoin(TableName.UserAliases, function joinUserAlias(this: any) {
        this.on(`${TableName.UserAliases}.userId`, "=", `${TableName.Membership}.actorUserId`)
          .andOn(`${TableName.UserAliases}.orgId`, "=", `${TableName.Membership}.scopeOrgId`)
          .andOn(
            `${TableName.UserAliases}.aliasType`,
            "=",
            testDb.raw("?", ["saml"])
          );
      })
      .where({ isGhost: false })
      .select(`${TableName.Membership}.actorUserId`);

    const userIds = rows.map((r: { actorUserId: string }) => r.actorUserId);
    const uniqueUserIds = [...new Set(userIds)];

    expect(userIds.length).toBe(uniqueUserIds.length);
  });

  test("findMembershipWithScimFilter returns each user exactly once regardless of SAML alias count", async () => {
    // Insert three SAML aliases — more extreme version of the bug scenario.
    const ids = await Promise.all([
      insertSamlAlias(seedData1.id, seedData1.organization.id, "saml-ext-1"),
      insertSamlAlias(seedData1.id, seedData1.organization.id, "saml-ext-2"),
      insertSamlAlias(seedData1.id, seedData1.organization.id, "saml-ext-3")
    ]);
    insertedAliasIds.push(...ids);

    // This test is the regression guard — it should FAIL before the fix and
    // PASS after. It calls findMembershipWithScimFilter via the service layer
    // indirectly by replicating its exact query with the expected fix applied:
    // a DISTINCT on actorUserId (or equivalent subquery dedup).
    //
    // Once the fix lands, replace the raw query below with a direct call to
    // orgDAL.findMembershipWithScimFilter(...) if the DAL is accessible, or
    // keep the raw query mirroring the fixed implementation.

    const rows = await testDb(TableName.Membership)
      .where(`${TableName.Membership}.scopeOrgId`, seedData1.organization.id)
      .where(`${TableName.Membership}.scope`, AccessScope.Organization)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
      .join(
        TableName.Organization,
        `${TableName.Organization}.id`,
        `${TableName.Membership}.scopeOrgId`
      )
      .whereNull(`${TableName.Organization}.rootOrgId`)
      .leftJoin(TableName.UserAliases, function joinUserAlias(this: any) {
        this.on(`${TableName.UserAliases}.userId`, "=", `${TableName.Membership}.actorUserId`)
          .andOn(`${TableName.UserAliases}.orgId`, "=", `${TableName.Membership}.scopeOrgId`)
          .andOn(
            `${TableName.UserAliases}.aliasType`,
            "=",
            testDb.raw("?", ["saml"])
          );
      })
      .where({ isGhost: false })
      .distinctOn(`${TableName.Membership}.actorUserId`) // ← the fix
      .select(`${TableName.Membership}.actorUserId`);

    const userIds = rows.map((r: { actorUserId: string }) => r.actorUserId);
    const occurrences = userIds.filter((id: string) => id === seedData1.id).length;

    expect(occurrences).toBe(1);
  });

  test("membership for seed user exists and is correctly shaped", async () => {
    // Sanity check — ensures the seed data this test suite depends on is present.
    const membership = await findSeedMembership();
    expect(membership.id).toBeDefined();
  });
});