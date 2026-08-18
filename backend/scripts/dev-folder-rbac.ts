/* eslint-disable no-console */
// ############################################################################
// # TEMPORARY DEV SCRIPT — DELETE THIS FILE BEFORE MERGING.                  #
// #                                                                          #
// # Scaffolding for testing the folder RBAC roles by hand while the feature   #
// # is being built. It writes folder-scoped rows to `additional_privileges`   #
// # directly, because there is no API for them yet. Once the folder-grant     #
// # endpoints exist, this file has no reason to exist — remove it rather than #
// # maintaining it, and do not build anything on top of it.                   #
// ############################################################################
//
// Nothing evaluates `additional_privileges.role` yet: the permission queries
// deliberately filter folder-scoped rows out (see permission-dal.ts), and the
// rules are appended at the end of CASL evaluation in a later change. So today
// this script is for creating fixtures and eyeballing them; a granted role will
// not change what the user can actually do until that wiring lands.
//
// Usage (from backend/):
//   npx tsx scripts/dev-folder-rbac.ts <command> [flags]
//
//   projects                          list projects (id, slug, version)
//   folders  --project <slug|id> [--env <slug>]
//                                     list folders with their paths and ids
//   add-user --email <email> [--password <pw>] [--no-login]
//            [--org <slug|id>] [--project <slug|id>] [--project-role <role>]
//                                     create (or reuse) a user, org membership
//                                     and project membership
//   grant    --email <email> --project <slug|id> --env <slug> --path </a/b>
//            --role <list|read|edit|manage|full-access>
//   revoke   --email <email> [--project <slug|id> --env <slug> --path </a/b>] [--all]
//   show     --email <email>           memberships + folder grants
//
// Example: a user whose only access to a project is one folder role.
//   npx tsx scripts/dev-folder-rbac.ts add-user --email folder-tester@localhost.local \
//     --project first-project-v2
//   npx tsx scripts/dev-folder-rbac.ts grant --email folder-tester@localhost.local \
//     --project first-project-v2 --env dev --path / --role manage

import dotenv from "dotenv";
import knexLib, { Knex } from "knex";
import path from "path";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretFolderRole,
  TableName
} from "@app/db/schemas";

dotenv.config({ path: path.join(__dirname, "../../.env.migration") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

const GRANT_NAME_PREFIX = "dev-folder-rbac";

type TFlags = Record<string, string | boolean>;

const parseFlags = (argv: string[]): TFlags => {
  const flags: TFlags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
};

const requireFlag = (flags: TFlags, name: string): string => {
  const value = flags[name];
  if (typeof value !== "string" || !value.length) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
};

// Creating users and grants against a shared database is not something to do by
// accident, so anything that is not obviously a local DB has to be forced.
const assertLocalDatabase = (flags: TFlags) => {
  const uri = process.env.DB_CONNECTION_URI;
  if (!uri) {
    throw new Error(
      "DB_CONNECTION_URI is not set. Create .env.migration at the repo root from .env.migration.example."
    );
  }
  const isLocal = /@(localhost|127\.0\.0\.1|db)[:/]/.test(uri);
  if (!isLocal && flags.force !== true) {
    throw new Error("DB_CONNECTION_URI does not look local. Re-run with --force if you really mean it.");
  }
};

const resolveProject = async (db: Knex, ref: string) => {
  const project = await db(TableName.Project)
    .where((qb) => {
      void qb.where("slug", ref).orWhere("id", ref);
    })
    .whereNull("deleteAfter")
    .first();
  if (!project) throw new Error(`No project found with slug or id '${ref}'`);
  return project;
};

const resolveUser = async (db: Knex, email: string) => {
  const user = await db(TableName.Users)
    .where((qb) => {
      void qb.where("username", email).orWhere("email", email);
    })
    .first();
  if (!user) throw new Error(`No user found with email '${email}'. Create one with add-user first.`);
  return user;
};

// Folder paths are not stored, so they are rebuilt by walking parentId. The root
// folder of an environment is named "root" and represents "/".
type TFolderNode = { id: string; name: string; parentId: string | null; envId: string };

const buildFolderPaths = (folders: TFolderNode[]) => {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (folder: TFolderNode): string => {
    const segments: string[] = [];
    let cursor: TFolderNode | undefined = folder;
    while (cursor && cursor.parentId) {
      segments.unshift(cursor.name);
      cursor = byId.get(cursor.parentId);
    }
    return `/${segments.join("/")}`;
  };
  return new Map(folders.map((f) => [f.id, pathOf(f)]));
};

const loadFolders = async (db: Knex, projectId: string, envSlug?: string) => {
  const envQuery = db(TableName.Environment).where("projectId", projectId).whereNull("deleteAfter");
  if (envSlug) void envQuery.where("slug", envSlug);
  const environments = await envQuery.orderBy("position");

  if (!environments.length) {
    throw new Error(envSlug ? `Project has no environment '${envSlug}'` : "Project has no environments");
  }

  const folders: TFolderNode[] = await db(TableName.SecretFolder)
    .whereIn(
      "envId",
      environments.map((e) => e.id)
    )
    .whereNull("isReserved")
    .orWhere("isReserved", false)
    .whereIn(
      "envId",
      environments.map((e) => e.id)
    )
    .select("id", "name", "parentId", "envId");

  const paths = buildFolderPaths(folders);
  const envById = new Map(environments.map((e) => [e.id, e]));

  return folders
    .map((folder) => ({
      ...folder,
      path: paths.get(folder.id) as string,
      envSlug: envById.get(folder.envId)?.slug as string
    }))
    .sort((a, b) => a.envSlug.localeCompare(b.envSlug) || a.path.localeCompare(b.path));
};

const resolveFolder = async (db: Knex, projectId: string, envSlug: string, folderPath: string) => {
  const normalized = folderPath === "/" ? "/" : `/${folderPath.split("/").filter(Boolean).join("/")}`;
  const folders = await loadFolders(db, projectId, envSlug);
  const match = folders.find((f) => f.path === normalized);
  if (!match) {
    const available = folders.map((f) => f.path).join(", ") || "(none)";
    throw new Error(`No folder at '${normalized}' in environment '${envSlug}'. Available: ${available}`);
  }
  return match;
};

const cmdProjects = async (db: Knex) => {
  const projects = await db(TableName.Project)
    .whereNull("deleteAfter")
    .select("id", "name", "slug", "version", "type", "orgId")
    .orderBy("name");
  if (!projects.length) {
    console.log("No projects found. Run `npm run seed-dev` first.");
    return;
  }
  projects.forEach((p) => {
    console.log(`${p.slug}\t${p.id}\tv${p.version}\t${p.type}\t${p.name}`);
  });
};

const cmdFolders = async (db: Knex, flags: TFlags) => {
  const project = await resolveProject(db, requireFlag(flags, "project"));
  const envSlug = typeof flags.env === "string" ? flags.env : undefined;
  const folders = await loadFolders(db, project.id, envSlug);
  folders.forEach((f) => {
    console.log(`${f.envSlug}\t${f.path}\t${f.id}`);
  });
};

const cmdAddUser = async (db: Knex, flags: TFlags) => {
  const email = requireFlag(flags, "email");
  const withLogin = flags["no-login"] !== true;
  const password = typeof flags.password === "string" ? flags.password : "testInfisical@1";

  let user = await db(TableName.Users)
    .where((qb) => {
      void qb.where("username", email).orWhere("email", email);
    })
    .first();

  if (user) {
    console.log(`user exists id=${user.id} (${email})`);
  } else {
    [user] = await db(TableName.Users)
      .insert({
        username: email,
        email,
        firstName: email.split("@")[0],
        lastName: "",
        authMethods: ["email"],
        isAccepted: true,
        isEmailVerified: true,
        isMfaEnabled: false
      })
      .returning("*");
    console.log(`created user id=${user.id} (${email})`);
  }

  if (withLogin) {
    // Password + SRP material is what makes the user able to log in. Both need the
    // FIPS-aware crypto module, which needs the env config bootstrapped first —
    // same sequence as src/db/seeds/1-user.ts. Imported lazily so the read-only
    // commands work in an environment that cannot bootstrap it.
    const existingKeys = await db(TableName.UserEncryptionKey).where("userId", user.id).first();
    if (existingKeys) {
      console.log("login credentials already present, leaving them alone");
    } else {
      const { initializeHsmModule } = await import("@app/ee/services/hsm/hsm-fns");
      const { hsmServiceFactory } = await import("@app/ee/services/hsm/hsm-service");
      const { getHsmConfig, initEnvConfig } = await import("@app/lib/config/env");
      const { crypto } = await import("@app/lib/crypto/cryptography");
      const { initLogger, logger } = await import("@app/lib/logger");
      const { kmsRootConfigDALFactory } = await import("@app/services/kms/kms-root-config-dal");
      const { superAdminDALFactory } = await import("@app/services/super-admin/super-admin-dal");
      const { generateUserSrpKeys } = await import("../src/db/seed-data");

      initLogger();
      const hsmConfig = getHsmConfig(logger);
      const hsmModule = initializeHsmModule(hsmConfig);
      hsmModule.initialize();
      const hsmService = hsmServiceFactory({ hsmModule: hsmModule.getModule(), envConfig: hsmConfig });
      await hsmService.startService();
      await initEnvConfig(hsmService, kmsRootConfigDALFactory(db), superAdminDALFactory(db), logger);

      const hashedPassword = await crypto.hashing().createHash(password, 10);
      await db(TableName.Users).where("id", user.id).update({ hashedPassword });

      const encKeys = await generateUserSrpKeys(password);
      await db(TableName.UserEncryptionKey).insert({
        encryptionVersion: 2,
        protectedKey: encKeys.protectedKey,
        protectedKeyIV: encKeys.protectedKeyIV,
        protectedKeyTag: encKeys.protectedKeyTag,
        publicKey: encKeys.publicKey,
        encryptedPrivateKey: encKeys.encryptedPrivateKey,
        iv: encKeys.encryptedPrivateKeyIV,
        tag: encKeys.encryptedPrivateKeyTag,
        salt: encKeys.salt,
        verifier: encKeys.verifier,
        userId: user.id
      });
      console.log(`set login password=${password}`);
    }
  }

  const orgRef = typeof flags.org === "string" ? flags.org : undefined;
  const projectRef = typeof flags.project === "string" ? flags.project : undefined;

  let orgId: string | undefined;
  if (projectRef) {
    orgId = (await resolveProject(db, projectRef)).orgId;
  } else if (orgRef) {
    const org = await db(TableName.Organization)
      .where((qb) => {
        void qb.where("slug", orgRef).orWhere("id", orgRef);
      })
      .first();
    if (!org) throw new Error(`No organization found with slug or id '${orgRef}'`);
    orgId = org.id;
  }

  if (!orgId) {
    console.log("no --org or --project given, skipping memberships");
    return;
  }

  let orgMembership = await db(TableName.Membership)
    .where({ scope: AccessScope.Organization, scopeOrgId: orgId, actorUserId: user.id })
    .first();
  if (!orgMembership) {
    [orgMembership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: orgId,
        actorUserId: user.id,
        isActive: true,
        status: OrgMembershipStatus.Accepted
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });
    console.log(`created org membership id=${orgMembership.id} role=member`);
  } else {
    console.log(`org membership exists id=${orgMembership.id}`);
  }

  if (!projectRef) return;

  const project = await resolveProject(db, projectRef);
  // no-access by default on purpose: it makes the folder grant the only thing
  // giving this user access, so the role under test is what you are observing.
  const projectRole =
    typeof flags["project-role"] === "string" ? flags["project-role"] : ProjectMembershipRole.NoAccess;

  let projectMembership = await db(TableName.Membership)
    .where({ scope: AccessScope.Project, scopeProjectId: project.id, actorUserId: user.id })
    .first();
  if (!projectMembership) {
    [projectMembership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeProjectId: project.id,
        scopeOrgId: project.orgId,
        actorUserId: user.id,
        isActive: true
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: projectMembership.id, role: projectRole });
    console.log(`created project membership id=${projectMembership.id} role=${projectRole} project=${project.slug}`);
  } else {
    console.log(`project membership exists id=${projectMembership.id} project=${project.slug}`);
  }
};

const cmdGrant = async (db: Knex, flags: TFlags) => {
  const role = requireFlag(flags, "role");
  const validRoles = Object.values(SecretFolderRole) as string[];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid --role '${role}'. Expected one of: ${validRoles.join(", ")}`);
  }

  const user = await resolveUser(db, requireFlag(flags, "email"));
  const project = await resolveProject(db, requireFlag(flags, "project"));
  const folder = await resolveFolder(db, project.id, requireFlag(flags, "env"), requireFlag(flags, "path"));

  // Unique index additional_privileges_unique_user_folder forbids a second row for
  // the same actor+folder, so update in place instead of inserting a duplicate.
  const existing = await db(TableName.AdditionalPrivilege).where({ actorUserId: user.id, folderId: folder.id }).first();

  if (existing) {
    await db(TableName.AdditionalPrivilege).where("id", existing.id).update({ role });
    console.log(`updated grant id=${existing.id} ${existing.role} -> ${role} on ${folder.envSlug}:${folder.path}`);
    return;
  }

  const [created] = await db(TableName.AdditionalPrivilege)
    .insert({
      name: `${GRANT_NAME_PREFIX}-${folder.envSlug}-${Date.now()}`,
      actorUserId: user.id,
      projectId: project.id,
      folderId: folder.id,
      role,
      permissions: null,
      isTemporary: false
    })
    .returning("*");
  console.log(`created grant id=${created.id} role=${role} on ${folder.envSlug}:${folder.path}`);
};

const cmdRevoke = async (db: Knex, flags: TFlags) => {
  const user = await resolveUser(db, requireFlag(flags, "email"));

  if (flags.all === true) {
    const deleted = await db(TableName.AdditionalPrivilege)
      .where("actorUserId", user.id)
      .whereNotNull("folderId")
      .del();
    console.log(`revoked ${deleted} folder grant(s)`);
    return;
  }

  const project = await resolveProject(db, requireFlag(flags, "project"));
  const folder = await resolveFolder(db, project.id, requireFlag(flags, "env"), requireFlag(flags, "path"));
  const deleted = await db(TableName.AdditionalPrivilege).where({ actorUserId: user.id, folderId: folder.id }).del();
  console.log(`revoked ${deleted} grant(s) on ${folder.envSlug}:${folder.path}`);
};

const cmdShow = async (db: Knex, flags: TFlags) => {
  const user = await resolveUser(db, requireFlag(flags, "email"));
  console.log(`user id=${user.id} username=${user.username}`);

  const memberships = await db(TableName.Membership)
    .leftJoin(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
    .leftJoin(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
    .where(`${TableName.Membership}.actorUserId`, user.id)
    .select(
      db.ref("scope").withSchema(TableName.Membership),
      db.ref("isActive").withSchema(TableName.Membership),
      db.ref("role").withSchema(TableName.MembershipRole),
      db.ref("slug").withSchema(TableName.Project).as("projectSlug")
    );

  console.log("\nmemberships:");
  if (!memberships.length) console.log("  (none)");
  memberships.forEach((m) => {
    console.log(`  ${m.scope}${m.projectSlug ? `:${m.projectSlug}` : ""}\trole=${m.role}\tactive=${m.isActive}`);
  });

  const grants = await db(TableName.AdditionalPrivilege)
    .where("actorUserId", user.id)
    .whereNotNull("folderId")
    .select("id", "role", "folderId", "projectId", "name");

  console.log("\nfolder grants:");
  if (!grants.length) {
    console.log("  (none)");
    return;
  }

  // folderId and projectId are nullable columns, and the folder_requires_project check means a
  // folder grant always has both. Narrow explicitly rather than asserting.
  const locatable = grants.filter(
    (grant): grant is typeof grant & { folderId: string; projectId: string } =>
      Boolean(grant.folderId) && Boolean(grant.projectId)
  );

  const pathCache = new Map<string, { path: string; envSlug: string }>();
  const loadedProjects = new Set<string>();
  for (const grant of locatable) {
    if (!loadedProjects.has(grant.projectId)) {
      loadedProjects.add(grant.projectId);
      // eslint-disable-next-line no-await-in-loop
      const folders = await loadFolders(db, grant.projectId);
      folders.forEach((f) => pathCache.set(f.id, { path: f.path, envSlug: f.envSlug }));
    }
    const location = pathCache.get(grant.folderId);
    console.log(
      `  ${grant.role}\t${location ? `${location.envSlug}:${location.path}` : `folderId=${grant.folderId}`}\tid=${grant.id}`
    );
  }
};

const COMMANDS: Record<string, (db: Knex, flags: TFlags) => Promise<void>> = {
  projects: cmdProjects,
  folders: cmdFolders,
  "add-user": cmdAddUser,
  grant: cmdGrant,
  revoke: cmdRevoke,
  show: cmdShow
};

const main = async () => {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (!command || !COMMANDS[command]) {
    console.log(
      `Usage: npx tsx scripts/dev-folder-rbac.ts <${Object.keys(COMMANDS).join("|")}> [flags]\nSee the header of this file for examples.`
    );
    process.exit(command ? 1 : 0);
  }

  assertLocalDatabase(flags);

  const db = knexLib({ client: "pg", connection: process.env.DB_CONNECTION_URI });
  try {
    await COMMANDS[command](db, flags);
  } finally {
    await db.destroy();
  }
};

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
