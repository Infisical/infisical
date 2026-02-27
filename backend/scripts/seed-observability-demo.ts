/**
 * Observability demo seed - runs on demand only (not part of default seed).
 * Adds demo data (machine identities, tokens, webhooks, widgets) without touching
 * existing user data. User-created widgets are preserved.
 *
 * Usage: npm run seed:observability-demo [orgId] [userEmail]
 */
import path from "path";

import dotenv from "dotenv";
import knex, { Knex } from "knex";

import { seedObservabilityDemo } from "../src/db/manual/observability-demo";
import { seedData1 } from "../src/db/seed-data";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

const run = async () => {
  const targetOrgId = process.argv[2] || seedData1.organization.id;
  const userEmail = process.argv[3]; // e.g. igor2.horta@gmail.com
  const connectionString = process.env.DB_CONNECTION_URI;
  if (!connectionString) {
    throw new Error("DB_CONNECTION_URI is required. Set it in .env or .env.migration");
  }
  const db = knex({
    client: "pg",
    connection: connectionString,
    pool: { min: 1, max: 5 }
  } as Knex.Config);

  try {
    await seedObservabilityDemo(db, targetOrgId, userEmail);
    // eslint-disable-next-line no-console
    console.log(`\nObservability demo data seeded for org ${targetOrgId}`);
    if (!process.argv[2]) {
      // eslint-disable-next-line no-console
      console.log("Tip: Run with orgId and userEmail to target a specific org: npm run seed:observability-demo <orgId> <userEmail>");
    }
  } finally {
    await db.destroy();
  }
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to seed observability demo data", err);
  process.exit(1);
});
