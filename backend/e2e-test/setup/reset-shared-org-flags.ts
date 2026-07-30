import type { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

// Several auth specs flip org-wide flags on the *shared* seeded org and undo it
// in afterAll:
//
//   auth-mfa.spec.ts               enforceMfa
//   auth-signup-sso-enforced.spec  authEnforced
//   scim.spec.ts                   scimEnabled
//   auth-idp-attacks.spec.ts       scimEnabled
//
// Those afterAll hooks don't run when a file dies hard — a worker OOM or a
// file-level timeout — and a leaked flag then breaks every later spec that logs
// in as the seeded user, with a failure that points nowhere near the cause.
//
// Test files run sequentially in a single fork, so resetting the flags at the
// start of every file makes each one self-healing regardless of how its
// predecessor ended. All three columns default to false in the schema, so this
// restores the seeded baseline rather than inventing one.
//
// This runs before any hook the spec itself registers, so a spec that wants a
// flag on still gets it. If that ordering ever changed, the affected spec would
// fail outright rather than silently skip its setup.
beforeAll(async () => {
  const db = (globalThis as unknown as { testDb: Knex }).testDb;
  await db(TableName.Organization).where({ id: seedData1.organization.id }).update({
    enforceMfa: false,
    authEnforced: false,
    scimEnabled: false
  });
});
