/* eslint-disable */
import promptSync from "prompt-sync";
import { execSync } from "child_process";
import path from "path";
import { existsSync } from "fs";

const prompt = promptSync({
    sigint: true
});

const exportDb = () => {
    const exportHost = prompt("Enter your Postgres Host to migrate from: ");
    const exportPort = prompt("Enter your Postgres Port to migrate from [Default = 5432]: ") ?? "5432";
    const exportUser = prompt("Enter your Postgres User to migrate from: [Default = infisical]: ") ?? "infisical";
    const exportPassword = prompt("Enter your Postgres Password to migrate from: ");
    const exportDatabase = prompt("Enter your Postgres Database to migrate from [Default = infisical]: ") ?? "infisical";

    execSync(
        `PGDATABASE="${exportDatabase}" PGPASSWORD="${exportPassword}" PGHOST="${exportHost}" PGPORT=${exportPort} PGUSER=${exportUser} pg_dump infisical --exclude-table "audit_log*" > ${path.join(__dirname, "../src/db/dump.sql")}`,
        { stdio: "inherit" }
    );
}

const importDbForOrg = () => {
    const importHost = prompt("Enter your Postgres Host to migrate to: ");
    const importPort = prompt("Enter your Postgres Port to migrate to [Default = 5432]: ") ?? "5432";
    const importUser = prompt("Enter your Postgres User to migrate to: [Default = infisical]: ") ?? "infisical";
    const importPassword = prompt("Enter your Postgres Password to migrate to: ");
    const importDatabase = prompt("Enter your Postgres Database to migrate to [Default = infisical]: ") ?? "infisical";
    const orgId = prompt("Enter the organization ID to migrate: ");

    if (!existsSync(path.join(__dirname, "../src/db/dump.sql"))) {
        console.log("File not found, please export the database first.");
        return;
    }

    execSync(`PGDATABASE="${importDatabase}" PGPASSWORD="${importPassword}" PGHOST="${importHost}" PGPORT=${importPort} PGUSER=${importUser} psql -f ${path.join(__dirname, "../src/db/dump.sql")}`);

    execSync(`PGDATABASE="${importDatabase}" PGPASSWORD="${importPassword}" PGHOST="${importHost}" PGPORT=${importPort} PGUSER=${importUser} psql -c "DELETE FROM public.organizations WHERE id != '${orgId}'"`);

    console.log("Organization migrated successfully.");
}

const main = () => {
    const action = prompt("Enter the action to perform\n 1. Export from existing instance.\n 2. Import org to instance.\n \n Action: ");
    if (action === "1") {
        exportDb();
    } else if (action === "2") {
        importDbForOrg();
    } else {
        console.log("Invalid action");
    }
}

main();