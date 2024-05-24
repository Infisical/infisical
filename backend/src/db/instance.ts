import knex from "knex";

export type TDbClient = ReturnType<typeof initDbConnection>;
export const initDbConnection = ({ dbConnectionUri, dbRootCert }: { dbConnectionUri: string; dbRootCert?: string }) => {
  const db = knex({
    client: "pg",
    connection: {
      connectionString: dbConnectionUri,
      host: process.env.DB_HOST,
      // @ts-expect-error I have no clue why only for the port there is a type error
      // eslint-disable-next-line
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
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
