/* eslint-disable no-await-in-loop */
import { Knex } from "knex";

import { AccessScope, TableName } from "../schemas";

const MIGRATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

  const migrationStart = Date.now();
  // eslint-disable-next-line no-console
  const log = (msg: string) => console.log(`[username-merge] ${msg} (${Date.now() - migrationStart}ms elapsed)`);

  try {
    // ============================================================
    // Step 1: Copy hashedPassword from user_encryption_keys to users
    // ============================================================
    log("Step 1: copying hashedPassword...");
    let t = Date.now();
    await knex.raw(`
    UPDATE "${TableName.Users}" u
    SET "hashedPassword" = uek."hashedPassword"
    FROM "${TableName.UserEncryptionKey}" uek
    WHERE u.id = uek."userId"
      AND uek."hashedPassword" IS NOT NULL
      AND u."hashedPassword" IS NULL
  `);
    log(`Step 1 done in ${Date.now() - t}ms`);

    // ============================================================
    // Step 2: Mark provider-verified flags based on authMethods
    // ============================================================
    log("Step 2: setting provider-verified flags...");
    t = Date.now();
    await knex.raw(`
    UPDATE "${TableName.Users}"
    SET "isGitHubVerified" = TRUE
    WHERE "authMethods" @> ARRAY['github']::text[]
      AND ("isGitHubVerified" IS NULL OR "isGitHubVerified" = FALSE)
  `);

    await knex.raw(`
    UPDATE "${TableName.Users}"
    SET "isGoogleVerified" = TRUE
    WHERE "authMethods" @> ARRAY['google']::text[]
      AND ("isGoogleVerified" IS NULL OR "isGoogleVerified" = FALSE)
  `);

    await knex.raw(`
    UPDATE "${TableName.Users}"
    SET "isGitLabVerified" = TRUE
    WHERE "authMethods" @> ARRAY['gitlab']::text[]
      AND ("isGitLabVerified" IS NULL OR "isGitLabVerified" = FALSE)
  `);
    log(`Step 2 done in ${Date.now() - t}ms`);

    // ============================================================
    // Step 3: Clean up duplicate users sharing the same email
    //
    // All FK references to users are either CASCADE (deleted with the user)
    // or SET NULL (nulled out). So deleting a user row is always safe.
    // For verified+accepted duplicates, we reassign FK references to the winner before deleting.
    // ============================================================

    // Get all FK references to users.id once (used when merging verified+accepted duplicates)
    log("Step 3: fetching FK references...");
    t = Date.now();
    const fkRefs = await knex.raw(`
    SELECT
        c.conrelid::regclass::text AS table_name,
        a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.users'::regclass
      AND c.confkey = ARRAY(
          SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.users'::regclass AND attname = 'id'
      )
  `);
    const userFkReferences = fkRefs.rows as { table_name: string; column_name: string }[];
    log(`Step 3: found ${userFkReferences.length} FK refs in ${Date.now() - t}ms`);

    // Phase 1: Ghost all simple-deletable duplicate users
    // DELETE is too slow (~3.4s per user due to 48 FK constraint checks even on empty refs).
    // Instead, randomize username/email and mark as ghost so they're invisible and don't conflict.
    log("Phase 1: finding and ghosting simple duplicates...");
    t = Date.now();
    const ghostResult = await knex.raw(`
      WITH duplicate_groups AS (
        SELECT LOWER(email) AS email
        FROM "${TableName.Users}"
        WHERE email IS NOT NULL AND "isGhost" = FALSE
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
      ),
      duplicate_users AS (
        SELECT u.id, u."isEmailVerified", u."isAccepted"
        FROM "${TableName.Users}" u
        JOIN duplicate_groups dg ON LOWER(u.email) = dg.email
        WHERE u."isGhost" = FALSE
      ),
      users_with_membership AS (
        SELECT DISTINCT m."actorUserId"
        FROM "${TableName.Membership}" m
        JOIN duplicate_users du ON du.id = m."actorUserId"
        WHERE m.scope = '${AccessScope.Organization}'
      ),
      to_ghost AS (
        SELECT du.id
        FROM duplicate_users du
        WHERE NOT du."isEmailVerified"
           OR NOT du."isAccepted"
           OR du.id NOT IN (SELECT "actorUserId" FROM users_with_membership)
      )
      UPDATE "${TableName.Users}" u
      SET username = 'ghost-' || gen_random_uuid(),
          email = 'ghost-' || gen_random_uuid() || '@ghost.local',
          "isGhost" = TRUE,
          "isEmailVerified" = FALSE,
          "isAccepted" = FALSE
      WHERE u.id IN (SELECT id FROM to_ghost)
      RETURNING u.id
    `);
    const ghostedUserIds = (ghostResult.rows as { id: string }[]).map((r) => r.id);
    log(`Phase 1 done in ${Date.now() - t}ms — ghosted ${ghostedUserIds.length} users`);

    // Phase 2: Find merge groups among remaining duplicates
    // Now that simple duplicates are ghosted, any remaining duplicate-email groups need FK reassignment
    // Winner: prefer user whose username matches the email, otherwise earliest by createdAt
    log("Phase 2: finding merge groups...");
    t = Date.now();
    const mergeResult = await knex.raw(`
      WITH ranked AS (
        SELECT u.id, LOWER(u.email) AS email,
               ROW_NUMBER() OVER (
                 PARTITION BY LOWER(u.email)
                 ORDER BY (u.username = LOWER(u.email)) DESC, u."createdAt" ASC
               ) AS rn
        FROM "${TableName.Users}" u
        WHERE u.email IS NOT NULL AND u."isGhost" = FALSE
          AND LOWER(u.email) IN (
            SELECT LOWER(email) FROM "${TableName.Users}"
            WHERE email IS NOT NULL AND "isGhost" = FALSE
            GROUP BY LOWER(email) HAVING COUNT(*) > 1
          )
      )
      SELECT w.id AS winner_id, l.id AS loser_id
      FROM ranked w
      JOIN ranked l ON l.email = w.email AND l.rn > 1
      WHERE w.rn = 1
      ORDER BY w.id
    `);

    const mergeMap = new Map<string, string[]>();
    for (const row of mergeResult.rows as { winner_id: string; loser_id: string }[]) {
      const existing = mergeMap.get(row.winner_id);
      if (existing) {
        existing.push(row.loser_id);
      } else {
        mergeMap.set(row.winner_id, [row.loser_id]);
      }
    }
    const mergeGroups = Array.from(mergeMap.entries()).map(([winnerId, loserIds]) => ({ winnerId, loserIds }));
    log(`Phase 2 done in ${Date.now() - t}ms — ${mergeGroups.length} merge groups`);

    // Phase 3: FK reassignment + ghost merge losers
    // One UPDATE per FK table using CASE to map all losers→winners at once.
    // This is 48 queries instead of 45 groups × 24 tables = 1,080 queries.
    const allMergeLoserIds: string[] = mergeGroups.flatMap((g) => g.loserIds);

    // Build loser→winner mapping
    const loserToWinner = new Map<string, string>();
    for (const { winnerId, loserIds } of mergeGroups) {
      for (const loserId of loserIds) {
        loserToWinner.set(loserId, winnerId);
      }
    }

    log(`Phase 3: reassigning FKs across ${userFkReferences.length} tables for ${allMergeLoserIds.length} losers...`);
    t = Date.now();
    let tablesProcessed = 0;
    for (const ref of userFkReferences) {
      const refStart = Date.now();
      const caseClauses = allMergeLoserIds
        .map((loserId) => `WHEN '${loserId}'::uuid THEN '${loserToWinner.get(loserId)!}'::uuid`)
        .join(" ");

      try {
        await knex.raw("SAVEPOINT fk_reassign");
        await knex.raw(
          `
          UPDATE "${ref.table_name}"
          SET "${ref.column_name}" = CASE "${ref.column_name}" ${caseClauses} END
          WHERE "${ref.column_name}" = ANY(?)
        `,
          [allMergeLoserIds]
        );
        await knex.raw("RELEASE SAVEPOINT fk_reassign");
      } catch (err: unknown) {
        await knex.raw("ROLLBACK TO SAVEPOINT fk_reassign");
        if ((err as { code?: string })?.code !== "23505") {
          throw err;
        }
      }

      tablesProcessed += 1;
      const refElapsed = Date.now() - refStart;
      if (refElapsed > 200) {
        log(
          `Phase 3: table ${tablesProcessed}/${userFkReferences.length} ${ref.table_name}.${ref.column_name} took ${refElapsed}ms`
        );
      }
    }
    log(`Phase 3: FK reassignment done in ${Date.now() - t}ms — processed ${tablesProcessed} tables`);

    // Ghost merge losers
    t = Date.now();
    if (allMergeLoserIds.length > 0) {
      await knex.raw(
        `
        UPDATE "${TableName.Users}"
        SET username = 'ghost-' || gen_random_uuid(),
            email = 'ghost-' || gen_random_uuid() || '@ghost.local',
            "isGhost" = TRUE,
            "isEmailVerified" = FALSE,
            "isAccepted" = FALSE
        WHERE id = ANY(?)
      `,
        [allMergeLoserIds]
      );
    }
    log(`Phase 3: ghosted ${allMergeLoserIds.length} merge losers in ${Date.now() - t}ms`);

    // Phase 4: Clean up memberships and aliases for users ghosted by this migration
    const allGhostedIds = [...ghostedUserIds, ...allMergeLoserIds];
    log(`Phase 4: cleaning up memberships and aliases for ${allGhostedIds.length} ghosted users...`);
    t = Date.now();
    if (allGhostedIds.length > 0) {
      await knex(TableName.Membership).whereIn("actorUserId", allGhostedIds).del();
      await knex(TableName.UserAliases).whereIn("userId", allGhostedIds).del();
    }
    log(`Phase 4 done in ${Date.now() - t}ms`);

    // Final step: update all remaining users where username != LOWER(email)
    log("Final step: normalizing usernames...");
    t = Date.now();
    await knex.raw(`
    UPDATE "${TableName.Users}"
    SET username = LOWER(email)
    WHERE email IS NOT NULL
      AND username != LOWER(email)
  `);
    log(`Final step done in ${Date.now() - t}ms`);
    log(`Migration complete — total ${Date.now() - migrationStart}ms`);
  } finally {
    if (Number(originalTimeout)) {
      await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
    }
  }
}

export async function down(): Promise<void> {
  // Data transformation — not reversible
}
