import path from "node:path";

import dotenv from "dotenv";

import { initAuditLogDbConnection, initDbConnection } from "./instance";

const isProduction = process.env.NODE_ENV === "production";

// Update with your config settings. .
dotenv.config({
  path: path.join(__dirname, "../../../.env.migration")
});
dotenv.config({
  path: path.join(__dirname, "../../../.env")
});

const runRename = async () => {
  if (!isProduction) return;
  const migrationTable = "infisical_migrations";
  const applicationDb = initDbConnection({
    dbConnectionUri: process.env.DB_CONNECTION_URI as string,
    dbRootCert: process.env.DB_ROOT_CERT
  });

  const auditLogDb = process.env.AUDIT_LOGS_DB_CONNECTION_URI
    ? initAuditLogDbConnection({
        dbConnectionUri: process.env.AUDIT_LOGS_DB_CONNECTION_URI,
        dbRootCert: process.env.AUDIT_LOGS_DB_ROOT_CERT
      })
    : undefined;

  const hasMigrationTable = await applicationDb.schema.hasTable(migrationTable);
  if (hasMigrationTable) {
    const firstFile = (await applicationDb(migrationTable).where({}).first()) as { name: string };
    if (firstFile?.name?.includes(".ts")) {
      await applicationDb(migrationTable).update({
        name: applicationDb.raw("REPLACE(name, '.ts', '.mjs')")
      });
    }
  }
  if (auditLogDb) {
    const hasMigrationTableInAuditLog = await auditLogDb.schema.hasTable(migrationTable);
    if (hasMigrationTableInAuditLog) {
      const firstFile = (await auditLogDb(migrationTable).where({}).first()) as { name: string };
      if (firstFile?.name?.includes(".ts")) {
        await auditLogDb(migrationTable).update({
          name: auditLogDb.raw("REPLACE(name, '.ts', '.mjs')")
        });
      }
    }
  }
  await applicationDb.destroy();
  await auditLogDb?.destroy();
};

void runRename();
