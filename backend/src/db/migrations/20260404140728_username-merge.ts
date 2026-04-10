/* eslint-disable no-await-in-loop */
import { Knex } from "knex";

import { AccessScope, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // Step 1: Copy hashedPassword from user_encryption_keys to users
  // ============================================================
  await knex.raw(`
    UPDATE "${TableName.Users}" u
    SET "hashedPassword" = uek."hashedPassword"
    FROM "${TableName.UserEncryptionKey}" uek
    WHERE u.id = uek."userId"
      AND uek."hashedPassword" IS NOT NULL
      AND u."hashedPassword" IS NULL
  `);

  // ============================================================
  // Step 2: Mark provider-verified flags based on authMethods
  // ============================================================
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

  // ============================================================
  // Step 3: Clean up duplicate users sharing the same email
  //
  // All FK references to users are either CASCADE (deleted with the user)
  // or SET NULL (nulled out). So deleting a user row is always safe.
  // For verified+accepted duplicates, we reassign FK references to the winner before deleting.
  // ============================================================

  // Get all FK references to users.id once (used when merging verified+accepted duplicates)
  const fkRefs = await knex.raw(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'users' AND ccu.column_name = 'id'
      AND tc.table_schema = 'public'
  `);
  const userFkReferences = fkRefs.rows as { table_name: string; column_name: string }[];

  // Find all emails with multiple user rows
  const duplicateEmails = await knex.raw(`
    SELECT LOWER(email) as email, array_agg(id) as user_ids
    FROM "${TableName.Users}"
    WHERE email IS NOT NULL AND "isGhost" = FALSE
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  `);

  for (const row of duplicateEmails.rows) {
    const { email, user_ids: userIds } = row as { email: string; user_ids: string[] };
    // eslint-disable-next-line no-continue
    if (!userIds || userIds.length < 2) continue;

    // Get details for all users in this group
    const users = await knex(TableName.Users)
      .select("id", "username", "isEmailVerified", "isAccepted")
      .whereIn("id", userIds)
      .orderBy("createdAt", "asc");

    // Find orphan users (no org membership) among duplicates
    const memberships = await knex(TableName.Membership)
      .select("actorUserId")
      .distinct("actorUserId")
      .whereIn("actorUserId", userIds)
      .where("scope", AccessScope.Organization);

    const usersWithMembership = new Set(memberships.map((r) => r.actorUserId));

    // Delete: incomplete users (not verified OR not accepted) + orphan users (no org membership)
    const deletableIds = users
      .filter((u) => !u.isEmailVerified || !u.isAccepted || !usersWithMembership.has(u.id))
      .map((u) => u.id);

    if (deletableIds.length > 0) {
      await knex(TableName.Users).whereIn("id", deletableIds).del();
    }

    // Check what's left
    const remaining = users.filter((u) => !deletableIds.includes(u.id));
    // eslint-disable-next-line no-continue
    if (remaining.length <= 1) continue;

    // Still multiple verified+accepted users — pick winner and merge losers into them
    const winner = remaining.find((u) => u.username === email) || remaining[0];
    const loserIds = remaining.filter((u) => u.id !== winner.id).map((u) => u.id);

    if (loserIds.length > 0) {
      // Reassign loser FK references to winner before deleting
      for (const ref of userFkReferences) {
        // Try to reassign loser rows to winner. If the winner already has a row
        // that would conflict (unique constraint), the update will fail for that row.
        // So we do it in two steps: update what we can, leave the rest for CASCADE delete.
        try {
          await knex.raw("SAVEPOINT fk_reassign");
          await knex(ref.table_name)
            .whereIn(ref.column_name, loserIds)
            .update({ [ref.column_name]: winner.id });
          await knex.raw("RELEASE SAVEPOINT fk_reassign");
        } catch (err: unknown) {
          await knex.raw("ROLLBACK TO SAVEPOINT fk_reassign");
          // Unique constraint violation (23505) — some rows couldn't be reassigned.
          // That's fine — they'll be cleaned up by CASCADE when the loser user is deleted.
          if ((err as { code?: string })?.code !== "23505") {
            throw err;
          }
        }
      }

      // Now delete losers — any remaining CASCADE refs will be cleaned up,
      // SET NULL refs were already reassigned or will be nulled
      await knex(TableName.Users).whereIn("id", loserIds).del();
    }
  }

  // Final step: update all remaining users where username != LOWER(email)
  await knex.raw(`
    UPDATE "${TableName.Users}"
    SET username = LOWER(email)
    WHERE email IS NOT NULL
      AND username != LOWER(email)
  `);
}

export async function down(): Promise<void> {
  // Data transformation — not reversible
}
