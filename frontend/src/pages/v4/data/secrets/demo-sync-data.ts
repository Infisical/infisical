import type { SyncDataLookups } from "./contract-sync-data";
import { listOf, ready } from "./demo-options";

const DEMO_SNOWFLAKE_SCHEMAS: Record<string, string[]> = {
  ACME_DEMO_ANALYTICS: ["PUBLIC", "REPORTING_DEMO"],
  ACME_DEMO_PAYMENTS: ["PUBLIC", "LEDGER_DEMO", "STAGING_DEMO"]
};

export const syncDataDemo: SyncDataLookups = {
  useDatabricksSecretScopes: listOf([
    { name: "acme-demo-etl" },
    { name: "acme-demo-reporting" },
    { name: "acme-demo-shared" }
  ]),
  useSnowflakeDatabases: listOf(Object.keys(DEMO_SNOWFLAKE_SCHEMAS).map((name) => ({ name }))),
  useSnowflakeSchemas: ({ database }, options) =>
    ready(
      (DEMO_SNOWFLAKE_SCHEMAS[database] ?? []).map((name) => ({ name })),
      options?.enabled ?? true
    ),
  useHasuraCloudProjects: listOf([
    { id: "demo-hasura-payments-api", name: "acme-demo-payments" },
    { id: "demo-hasura-analytics", name: "acme-demo-analytics" }
  ]),
  useCamundaClusters: listOf([
    { uuid: "00000000-0000-4000-8000-00000000ca01", name: "acme-demo-orders" },
    { uuid: "00000000-0000-4000-8000-00000000ca02", name: "acme-demo-fulfillment" }
  ]),
  useZabbixHosts: listOf([
    { hostId: "10101", host: "acme-demo-web-01" },
    { hostId: "10102", host: "acme-demo-db-01" },
    { hostId: "10103", host: "acme-demo-queue-01" }
  ])
};
