import { Knex } from "knex";

// Observability demo data is manual-only and does NOT run with seed:run.
// To add demo data, run: npm run seed:observability-demo [orgId] [userEmail]
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function seed(_knex: Knex): Promise<void> {
  // No-op: observability demo is seeded via scripts/seed-observability-demo.ts
}
