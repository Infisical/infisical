import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Step 1: Clean up duplicate user-project memberships
  // For each (actorUserId, scopeProjectId) pair with duplicates, keep the oldest membership
  // and move roles from duplicates to the kept membership, then delete duplicates
  await knex.raw(`
    WITH duplicates AS (
      SELECT id, "actorUserId", "scopeProjectId",
        ROW_NUMBER() OVER (
          PARTITION BY "actorUserId", "scopeProjectId"
          ORDER BY "createdAt" ASC
        ) as rn
      FROM ${TableName.Membership}
      WHERE scope = 'project'
        AND "actorUserId" IS NOT NULL
        AND "scopeProjectId" IS NOT NULL
    ),
    keeper AS (
      SELECT id as keeper_id, "actorUserId", "scopeProjectId"
      FROM duplicates
      WHERE rn = 1
    ),
    to_delete AS (
      SELECT d.id as dup_id, k.keeper_id
      FROM duplicates d
      JOIN keeper k ON d."actorUserId" = k."actorUserId"
        AND d."scopeProjectId" = k."scopeProjectId"
      WHERE d.rn > 1
    )
    UPDATE ${TableName.MembershipRole}
    SET "membershipId" = td.keeper_id
    FROM to_delete td
    WHERE ${TableName.MembershipRole}."membershipId" = td.dup_id
      AND NOT EXISTS (
        SELECT 1 FROM ${TableName.MembershipRole} mr2
        WHERE mr2."membershipId" = td.keeper_id
          AND mr2.role = ${TableName.MembershipRole}.role
          AND COALESCE(mr2."customRoleId"::text, '') = COALESCE(${TableName.MembershipRole}."customRoleId"::text, '')
      )
  `);

  // Delete orphaned membership roles that couldn't be moved (exact duplicates)
  await knex.raw(`
    WITH duplicates AS (
      SELECT id, "actorUserId", "scopeProjectId",
        ROW_NUMBER() OVER (
          PARTITION BY "actorUserId", "scopeProjectId"
          ORDER BY "createdAt" ASC
        ) as rn
      FROM ${TableName.Membership}
      WHERE scope = 'project'
        AND "actorUserId" IS NOT NULL
        AND "scopeProjectId" IS NOT NULL
    ),
    to_delete AS (
      SELECT id as dup_id FROM duplicates WHERE rn > 1
    )
    DELETE FROM ${TableName.MembershipRole}
    WHERE "membershipId" IN (SELECT dup_id FROM to_delete)
  `);

  // Delete the duplicate membership records
  await knex.raw(`
    WITH duplicates AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY "actorUserId", "scopeProjectId"
          ORDER BY "createdAt" ASC
        ) as rn
      FROM ${TableName.Membership}
      WHERE scope = 'project'
        AND "actorUserId" IS NOT NULL
        AND "scopeProjectId" IS NOT NULL
    )
    DELETE FROM ${TableName.Membership}
    WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
  `);

  // Step 2: Clean up duplicate user-org memberships
  await knex.raw(`
    WITH duplicates AS (
      SELECT id, "actorUserId", "scopeOrgId",
        ROW_NUMBER() OVER (
          PARTITION BY "actorUserId", "scopeOrgId"
          ORDER BY "createdAt" ASC
        ) as rn
      FROM ${TableName.Membership}
      WHERE scope = 'organization'
        AND "actorUserId" IS NOT NULL
    ),
    keeper AS (
      SELECT id as keeper_id, "actorUserId", "scopeOrgId"
      FROM duplicates
      WHERE rn = 1
    ),
    to_delete AS (
      SELECT d.id as dup_id, k.keeper_id
      FROM duplicates d
      JOIN keeper k ON d."actorUserId" = k."actorUserId"
        AND d."scopeOrgId" = k."scopeOrgId"
      WHERE d.rn > 1
    )
    UPDATE ${TableName.MembershipRole}
    SET "membershipId" = td.keeper_id
    FROM to_delete td
    WHERE ${TableName.MembershipRole}."membershipId" = td.dup_id
      AND NOT EXISTS (
        SELECT 1 FROM ${TableName.MembershipRole} mr2
        WHERE mr2."membershipId" = td.keeper_id
          AND mr2.role = ${TableName.MembershipRole}.role
          AND COALESCE(mr2."customRoleId"::text, '') = COALESCE(${TableName.MembershipRole}."customRoleId"::text, '')
      )
  `);

  await knex.raw(`
    WITH duplicates AS (
      SELECT id, "actorUserId", "scopeOrgId",
        ROW_NUMBER() OVER (
          PARTITION BY "actorUserId", "scopeOrgId"
          ORDER BY "createdAt" ASC
        ) as rn
      FROM ${TableName.Membership}
      WHERE scope = 'organization'
        AND "actorUserId" IS NOT NULL
    ),
    to_delete AS (
      SELECT id as dup_id FROM duplicates WHERE rn > 1
    )
    DELETE FROM ${TableName.MembershipRole}
    WHERE "membershipId" IN (SELECT dup_id FROM to_delete)
  `);

  await knex.raw(`
    WITH duplicates AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY "actorUserId", "scopeOrgId"
          ORDER BY "createdAt" ASC
        ) as rn
      FROM ${TableName.Membership}
      WHERE scope = 'organization'
        AND "actorUserId" IS NOT NULL
    )
    DELETE FROM ${TableName.Membership}
    WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
  `);

  // Step 3: Add unique partial indexes to prevent future duplicates
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_user_project_unique
    ON ${TableName.Membership} ("actorUserId", "scopeProjectId")
    WHERE scope = 'project' AND "actorUserId" IS NOT NULL;
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_user_org_unique
    ON ${TableName.Membership} ("actorUserId", "scopeOrgId")
    WHERE scope = 'organization' AND "actorUserId" IS NOT NULL;
  `);

  // Also add unique indexes for identity memberships to prevent similar issues
  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_identity_project_unique
    ON ${TableName.Membership} ("actorIdentityId", "scopeProjectId")
    WHERE scope = 'project' AND "actorIdentityId" IS NOT NULL;
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX membership_identity_org_unique
    ON ${TableName.Membership} ("actorIdentityId", "scopeOrgId")
    WHERE scope = 'organization' AND "actorIdentityId" IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS membership_user_project_unique`);
  await knex.schema.raw(`DROP INDEX IF EXISTS membership_user_org_unique`);
  await knex.schema.raw(`DROP INDEX IF EXISTS membership_identity_project_unique`);
  await knex.schema.raw(`DROP INDEX IF EXISTS membership_identity_org_unique`);
}
