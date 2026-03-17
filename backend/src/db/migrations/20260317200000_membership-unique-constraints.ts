import { Knex } from "knex";

import { TableName } from "../schemas";

/**
 * Finds groups of duplicate memberships for a given (actor, scope) combination.
 * Returns the keeper (earliest by createdAt) and the IDs of duplicates to remove.
 */
const findDuplicateGroups = async (
  tx: Knex.Transaction,
  scope: string,
  actorColumn: "actorUserId" | "actorIdentityId" | "actorGroupId",
  scopeIdColumn: "scopeProjectId" | "scopeOrgId"
) => {
  const duplicateGroups = await tx(TableName.Membership)
    .select(actorColumn, scopeIdColumn)
    .where({ scope })
    .whereNotNull(actorColumn)
    .whereNotNull(scopeIdColumn)
    .count("* as cnt")
    .groupBy(actorColumn, scopeIdColumn)
    .havingRaw("count(*) > ?", [1]);

  const results: { keeper: { id: string }; duplicateIds: string[]; actorId: string; scopeId: string }[] = [];

  for (const group of duplicateGroups) {
    const actorId = (group as unknown as Record<string, string>)[actorColumn];
    const scopeId = (group as unknown as Record<string, string>)[scopeIdColumn];

    // eslint-disable-next-line no-await-in-loop
    const memberships = await tx(TableName.Membership)
      .where({ scope, [actorColumn]: actorId, [scopeIdColumn]: scopeId })
      .orderBy("createdAt", "asc");

    if (memberships.length < 2) {
      // eslint-disable-next-line no-continue
      continue;
    }

    results.push({
      keeper: memberships[0],
      duplicateIds: memberships.slice(1).map((m: { id: string }) => m.id),
      actorId,
      scopeId
    });
  }

  return results;
};

/**
 * Deduplicates project-scoped memberships.
 *
 * Project memberships can have multiple roles, so we re-parent roles from
 * duplicate memberships onto the keeper before deleting the duplicates.
 */
const deduplicateProjectMemberships = async (
  tx: Knex.Transaction,
  actorColumn: "actorUserId" | "actorIdentityId" | "actorGroupId"
) => {
  const groups = await findDuplicateGroups(tx, "project", actorColumn, "scopeProjectId");

  for (const { keeper, duplicateIds, actorId, scopeId } of groups) {
    // Get existing roles on the keeper so we can skip true duplicates
    // eslint-disable-next-line no-await-in-loop
    const keeperRoles: { role: string; customRoleId: string | null }[] = await tx(TableName.MembershipRole)
      .where({ membershipId: keeper.id })
      .select("role", "customRoleId");

    const keeperRoleKeys = new Set(keeperRoles.map((r) => `${r.role}:${r.customRoleId ?? ""}`));

    // Find roles on duplicates that don't already exist on the keeper
    // eslint-disable-next-line no-await-in-loop
    const duplicateRoles: { id: string; role: string; customRoleId: string | null }[] = await tx(
      TableName.MembershipRole
    )
      .whereIn("membershipId", duplicateIds)
      .select("id", "role", "customRoleId");

    const rolesToReparent = duplicateRoles.filter((r) => !keeperRoleKeys.has(`${r.role}:${r.customRoleId ?? ""}`));

    if (rolesToReparent.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await tx(TableName.MembershipRole)
        .whereIn(
          "id",
          rolesToReparent.map((r) => r.id)
        )
        .update({ membershipId: keeper.id });
    }

    // Delete duplicates — CASCADE removes any remaining orphaned roles
    // eslint-disable-next-line no-await-in-loop
    const deleted = await tx(TableName.Membership).whereIn("id", duplicateIds).delete();

    // eslint-disable-next-line no-console
    console.log(
      `Deduplicated ${deleted} project membership(s) for ${actorColumn}=${actorId} scopeProjectId=${scopeId}`
    );
  }
};

/**
 * Deduplicates org-scoped memberships.
 *
 * Org memberships only have a single role, so we just keep the earliest
 * membership and delete the rest (CASCADE removes their roles).
 */
const deduplicateOrgMemberships = async (
  tx: Knex.Transaction,
  actorColumn: "actorUserId" | "actorIdentityId" | "actorGroupId"
) => {
  const groups = await findDuplicateGroups(tx, "organization", actorColumn, "scopeOrgId");

  for (const { duplicateIds, actorId, scopeId } of groups) {
    // eslint-disable-next-line no-await-in-loop
    const deleted = await tx(TableName.Membership).whereIn("id", duplicateIds).delete();

    // eslint-disable-next-line no-console
    console.log(`Deduplicated ${deleted} org membership(s) for ${actorColumn}=${actorId} scopeOrgId=${scopeId}`);
  }
};

export async function up(knex: Knex): Promise<void> {
  // Step 1: Clean up existing duplicates
  await knex.transaction(async (tx) => {
    // Project scope — re-parents roles from duplicates onto the keeper
    await deduplicateProjectMemberships(tx, "actorUserId");
    await deduplicateProjectMemberships(tx, "actorIdentityId");
    await deduplicateProjectMemberships(tx, "actorGroupId");

    // Org scope — single role, just keeps earliest and deletes the rest
    await deduplicateOrgMemberships(tx, "actorUserId");
    await deduplicateOrgMemberships(tx, "actorIdentityId");
    await deduplicateOrgMemberships(tx, "actorGroupId");
  });

  // Step 2: Add partial unique indexes.
  // Standard UNIQUE constraints won't work because the actor columns are nullable
  // (only one is non-null at a time). PostgreSQL treats NULLs as distinct in
  // unique constraints, so we need partial indexes with WHERE filters.

  // Project scope
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_unique_user_project
    ON ${TableName.Membership} ("scopeProjectId", "actorUserId")
    WHERE scope = 'project' AND "actorUserId" IS NOT NULL;
  `);
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_unique_identity_project
    ON ${TableName.Membership} ("scopeProjectId", "actorIdentityId")
    WHERE scope = 'project' AND "actorIdentityId" IS NOT NULL;
  `);
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_unique_group_project
    ON ${TableName.Membership} ("scopeProjectId", "actorGroupId")
    WHERE scope = 'project' AND "actorGroupId" IS NOT NULL;
  `);

  // Org scope
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_unique_user_org
    ON ${TableName.Membership} ("scopeOrgId", "actorUserId")
    WHERE scope = 'organization' AND "actorUserId" IS NOT NULL;
  `);
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_unique_identity_org
    ON ${TableName.Membership} ("scopeOrgId", "actorIdentityId")
    WHERE scope = 'organization' AND "actorIdentityId" IS NOT NULL;
  `);
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_unique_group_org
    ON ${TableName.Membership} ("scopeOrgId", "actorGroupId")
    WHERE scope = 'organization' AND "actorGroupId" IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_user_project;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_identity_project;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_group_project;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_user_org;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_identity_org;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_group_org;");
}
