import dotenv from "dotenv";
import knex from "knex";
import { Level } from "level";
import path from "path";

const main = async () => {
  dotenv.config();
  let postgres_url = process.env.POSTGRES_DB_URL;

  console.log("Checking postgres connection...");
  const db = knex({
    client: "pg",
    connection: postgres_url,
    migrations: {
      directory: path.join(__dirname, "./migrations"),
      extension: "ts",
      tableName: "infisical_migrations",
    },
  });
  console.log("Good to go with postgres");
  const kdb = new Level<string, any>("./db", { valueEncoding: "json" });
  console.log("Starting rolling back to latest");
  await db.migrate.rollback({}, true);
  console.log("Rolling back completed");
  kdb.clear();
  process.exit(0);
};

main();
