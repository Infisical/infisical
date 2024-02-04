import knex from "knex";

export type TDbClient = ReturnType<typeof initDbConnection>;
export const initDbConnection = (dbConnectionUri: string) => {
  const db = knex({
    client: "pg",
    connection: dbConnectionUri
  });

  return db;
};
