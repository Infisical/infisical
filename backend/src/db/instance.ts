import knex from "knex";

export type TDbClient = ReturnType<typeof initDbConnection>;
export const initDbConnection = ({ dbConnectionUri, dbRootCert }: { dbConnectionUri: string; dbRootCert?: string }) => {
  const db = knex({
    client: "pg",
    connection: {
      connectionString: dbConnectionUri,
      ssl: dbRootCert
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(dbRootCert, "base64").toString("ascii")
          }
        : false
    }
  });

  return db;
};
