/* eslint-disable */
import { execSync } from "child_process";
import { readdirSync } from "fs";
import path from "path";
import promptSync from "prompt-sync";

const prompt = promptSync();

const migrationName = prompt("Enter name for seedfile: ");
const fileCounter = readdirSync(path.join(__dirname, "../src/db/seed")).length || 1;
execSync(
  `npx knex seed:make --knexfile ${path.join(
    __dirname,
    "../src/db/knexfile.ts"
  )} -x ts ${fileCounter}-${migrationName}`,
  { stdio: "inherit" }
);
