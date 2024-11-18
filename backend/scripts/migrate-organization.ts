/* eslint-disable */
import promptSync from "prompt-sync";
import { execSync } from "child_process";
import path from "path";
import { existsSync } from "fs";

const prompt = promptSync({
  sigint: true
});

const sanitizeInputParam = (value: string) => {
  // Escape double quotes and wrap the entire value in double quotes
  if (value) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return '""';
};

const exportDb = () => {
  const exportHost = sanitizeInputParam(prompt("Enter your Postgres Host to migrate from: "));
  const exportPort = sanitizeInputParam(
    prompt("Enter your Postgres Port to migrate from [Default = 5432]: ") ?? "5432"
  );
  const exportUser = sanitizeInputParam(
    prompt("Enter your Postgres User to migrate from: [Default = infisical]: ") ?? "infisical"
  );
  const exportPassword = sanitizeInputParam(prompt("Enter your Postgres Password to migrate from: "));
  const exportDatabase = sanitizeInputParam(
    prompt("Enter your Postgres Database to migrate from [Default = infisical]: ") ?? "infisical"
  );

  // we do not include the audit_log and secret_sharing entries
  execSync(
    `PGDATABASE=${exportDatabase} PGPASSWORD=${exportPassword} PGHOST=${exportHost} PGPORT=${exportPort} PGUSER=${exportUser} pg_dump -Fc infisical --exclude-table-data="secret_sharing" --exclude-table-data="audit_log*" > ${path.join(
      __dirname,
      "../src/db/backup.dump"
    )}`,
    { stdio: "inherit" }
  );
};

const importDbForOrg = () => {
  const importHost = sanitizeInputParam(prompt("Enter your Postgres Host to migrate to: "));
  const importPort = sanitizeInputParam(prompt("Enter your Postgres Port to migrate to [Default = 5432]: ") ?? "5432");
  const importUser = sanitizeInputParam(
    prompt("Enter your Postgres User to migrate to: [Default = infisical]: ") ?? "infisical"
  );
  const importPassword = sanitizeInputParam(prompt("Enter your Postgres Password to migrate to: "));
  const importDatabase = sanitizeInputParam(
    prompt("Enter your Postgres Database to migrate to [Default = infisical]: ") ?? "infisical"
  );
  const orgId = sanitizeInputParam(prompt("Enter the organization ID to migrate: "));

  if (!existsSync(path.join(__dirname, "../src/db/backup.dump"))) {
    console.log("File not found, please export the database first.");
    return;
  }

  execSync(
    `PGDATABASE=${importDatabase} PGPASSWORD=${importPassword} PGHOST=${importHost} PGPORT=${importPort} PGUSER=${importUser} pg_restore -d ${importDatabase} --verbose ${path.join(
      __dirname,
      "../src/db/backup.dump"
    )}`,
    { maxBuffer: 1024 * 1024 * 4096 }
  );

  execSync(
    `PGDATABASE=${importDatabase} PGPASSWORD=${importPassword} PGHOST=${importHost} PGPORT=${importPort} PGUSER=${importUser} psql -c "DELETE FROM public.organizations WHERE id != '${orgId}'"`
  );

  // delete global/instance-level resources not relevant to the organization to migrate
  // users
  execSync(
    `PGDATABASE=${importDatabase} PGPASSWORD=${importPassword} PGHOST=${importHost} PGPORT=${importPort} PGUSER=${importUser} psql -c 'DELETE FROM users WHERE users.id NOT IN (SELECT org_memberships."userId" FROM org_memberships)'`
  );

  // identities
  execSync(
    `PGDATABASE=${importDatabase} PGPASSWORD=${importPassword} PGHOST=${importHost} PGPORT=${importPort} PGUSER=${importUser} psql -c 'DELETE FROM identities WHERE id NOT IN (SELECT "identityId" FROM identity_org_memberships)'`
  );

  // reset slack configuration in superAdmin
  execSync(
    `PGDATABASE=${importDatabase} PGPASSWORD=${importPassword} PGHOST=${importHost} PGPORT=${importPort} PGUSER=${importUser} psql -c 'UPDATE super_admin SET "encryptedSlackClientId" = null, "encryptedSlackClientSecret" = null'`
  );

  console.log("Organization migrated successfully.");
};

const main = () => {
  const action = prompt(
    "Enter the action to perform\n 1. Export from existing instance.\n 2. Import org to instance.\n \n Action: "
  );
  if (action === "1") {
    exportDb();
  } else if (action === "2") {
    importDbForOrg();
  } else {
    console.log("Invalid action");
  }
};

main();
