/* eslint-disable */
import { execSync } from "child_process";
import path from "path";
import promptSync from "prompt-sync";
import slugify from "@sindresorhus/slugify";

const prompt = promptSync({ sigint: true });

const migrationName = prompt("Enter name for migration: ");

// Remove spaces from migration name and replace with hyphens
const formattedMigrationName = slugify(migrationName);

execSync(
  `npx knex migrate:make --knexfile ${path.join(__dirname, "../src/db/knexfile.ts")} -x ts ${formattedMigrationName}`,
  { stdio: "inherit" }
);
