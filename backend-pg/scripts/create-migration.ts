/* eslint-disable */
import { execSync } from "child_process";
import path from "path";
import promptSync from "prompt-sync";

const prompt = promptSync();

const migrationName = prompt("Enter name for migration: ");

execSync(
  `npx knex migrate:make --knexfile ${path.join(
    __dirname,
    "../src/db/knexfile.ts"
  )} -x ts ${migrationName}`,
  { stdio: "inherit" }
);
