/* eslint-disable no-console */
// Populates a fresh Secret Manager project with a curated set of nested folders for exercising the
// `moveFolder` flow in src/services/secret-folder/secret-folder-service.ts.
//
// A folder can only be moved when its entire recursive subtree contains nothing but static secrets.
// $getFolderMoveBlock blocks a move when the subtree contains any of four resource types
// (dynamic_secret / secret_rotation / honey_token / secret_import) — and it only checks that such a
// row EXISTS, never decrypting or using it. So this script inserts those blockers as minimal rows with
// dummy KMS-encrypted blobs: enough to make a folder non-movable, without any live integration.
//
// The project is attached to the dev seed identity (seedData1) by default so it shows up immediately
// after `npm run seed-dev` and the seed user can log in (test@localhost.local / testInfisical@1).
//
// Usage (from backend/, with DB + Redis up and .env present):
//   npx tsx scripts/seed-folder-move-fixtures.ts
//
// Optional env overrides: ORG_ID, USER_ID.

import "dotenv/config";

import knexLib, { Knex } from "knex";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { getHsmConfig, initEnvConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { generateUserSrpKeys } from "@app/lib/crypto/srp";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod } from "@app/services/auth/auth-type";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { membershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { membershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { assignWorkspaceKeysToMembers, createProjectKey } from "@app/services/project/project-fns";
import { projectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  ProjectType,
  ProjectVersion,
  TableName
} from "../src/db/schemas";
import { seedData1 } from "../src/db/seed-data";

const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Production", slug: "prod" }
];

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`${key} must be set`);
  }
  return value;
};

// Mirrors createUserWithGhostUser in src/db/seeds/3-project.ts: stands up the ghost user, project keys,
// project bot, and grants the real seed user admin membership so the project is fully UI-accessible.
const createUserWithGhostUser = async (orgId: string, projectId: string, userId: string, knex: Knex) => {
  const projectKeyDAL = projectKeyDALFactory(knex);
  const userDAL = userDALFactory(knex);
  const membershipDAL = membershipUserDALFactory(knex);
  const membershipRoleDAL = membershipRoleDALFactory(knex);

  const userOrgMembership = await knex(TableName.Membership)
    .where({ scopeOrgId: orgId, actorUserId: userId, scope: AccessScope.Organization })
    .first();
  if (!userOrgMembership) {
    throw new Error(`Org membership not found for user '${userId}' in org '${orgId}'. Run 'npm run seed-dev' first.`);
  }

  const email = `sudo-${alphaNumericNanoId(16)}-${orgId}@infisical.com`;
  const password = crypto.randomBytes(128).toString("hex");

  const [ghostUser] = await knex(TableName.Users)
    .insert({ isGhost: true, authMethods: [AuthMethod.EMAIL], username: email, email, isAccepted: true })
    .returning("*");

  const encKeys = await generateUserSrpKeys(email, password);

  await knex(TableName.UserEncryptionKey)
    .insert({ userId: ghostUser.id, encryptionVersion: 2, publicKey: encKeys.publicKey })
    .onConflict("userId")
    .merge();

  const [ghostOrgMembership] = await knex(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: ghostUser.id,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");
  await knex(TableName.MembershipRole).insert({ membershipId: ghostOrgMembership.id, role: OrgMembershipRole.Admin });

  const [ghostProjectMembership] = await knex(TableName.Membership)
    .insert({
      actorUserId: ghostUser.id,
      scopeProjectId: projectId,
      scope: AccessScope.Project,
      scopeOrgId: orgId,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");
  await knex(TableName.MembershipRole).insert({
    membershipId: ghostProjectMembership.id,
    role: ProjectMembershipRole.Admin
  });

  const { key: encryptedProjectKey, iv: encryptedProjectKeyIv } = createProjectKey({
    publicKey: encKeys.publicKey,
    privateKey: encKeys.plainPrivateKey
  });

  await knex(TableName.ProjectKeys).insert({
    projectId,
    receiverId: ghostUser.id,
    encryptedKey: encryptedProjectKey,
    nonce: encryptedProjectKeyIv,
    senderId: ghostUser.id
  });

  const { iv, tag, ciphertext, encoding, algorithm } = crypto
    .encryption()
    .symmetric()
    .encryptWithRootEncryptionKey(encKeys.plainPrivateKey);

  await knex(TableName.ProjectBot).insert({
    name: "Infisical Bot (Ghost)",
    projectId,
    tag,
    iv,
    encryptedProjectKey,
    encryptedProjectKeyNonce: encryptedProjectKeyIv,
    encryptedPrivateKey: ciphertext,
    isActive: true,
    publicKey: encKeys.publicKey,
    senderId: ghostUser.id,
    algorithm,
    keyEncoding: encoding
  });

  const latestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId, knex);
  if (!latestKey) throw new Error("Latest key not found for ghost user");

  const user = await userDAL.findUserEncKeyByUserId(userId, knex);
  if (!user?.id) throw new Error("Seed user not found");

  const userEnc = await knex(TableName.UserEncryptionKey).where({ userId: user.id }).first();

  const [projectAdmin] = assignWorkspaceKeysToMembers({
    decryptKey: latestKey,
    userPrivateKey: encKeys.plainPrivateKey,
    members: [{ userPublicKey: userEnc?.publicKey || "", orgMembershipId: userOrgMembership.id }]
  });

  const userProjectMembership = await membershipDAL.create(
    { scopeProjectId: projectId, scope: AccessScope.Project, actorUserId: user.id, scopeOrgId: orgId },
    knex
  );
  await membershipRoleDAL.create({ membershipId: userProjectMembership.id, role: ProjectMembershipRole.Admin }, knex);

  await projectKeyDAL.create(
    {
      encryptedKey: projectAdmin.workspaceEncryptedKey,
      nonce: projectAdmin.workspaceEncryptedNonce,
      senderId: ghostUser.id,
      receiverId: user.id,
      projectId
    },
    knex
  );
};

const main = async () => {
  const dbUri = required("DB_CONNECTION_URI");
  const orgId = required("ORG_ID", seedData1.organization.id);
  const userId = required("USER_ID", seedData1.id);

  const knex = knexLib({ client: "pg", connection: dbUri, pool: { min: 1, max: 2 } });
  // No replicas here, so route everything through the same connection (kms-service reads via these).
  knex.primaryNode = () => knex;
  knex.replicaNode = () => knex;

  initLogger();

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const hsmConfig = getHsmConfig(logger);

  const hsmModule = initializeHsmModule(hsmConfig);
  hsmModule.initialize();
  const hsmService = hsmServiceFactory({ hsmModule: hsmModule.getModule(), envConfig: hsmConfig });
  await hsmService.startService();
  const envConfig = await initEnvConfig(hsmService, kmsRootConfigDAL, superAdminDAL, logger);

  const kmsService = kmsServiceFactory({
    kmsRootConfigDAL,
    kmsDAL: kmskeyDALFactory(knex),
    internalKmsDAL: internalKmsDALFactory(knex),
    orgDAL: orgDALFactory(knex),
    projectDAL: projectDALFactory(knex),
    hsmService,
    envConfig
  });
  await kmsService.startService({ rootKmsConfigEncryptionStrategy: null, isHsmConfigured: false });

  const org = await knex(TableName.Organization).where({ id: orgId }).first();
  if (!org) throw new Error(`Org '${orgId}' not found. Run 'npm run seed-dev' first or pass ORG_ID.`);

  // ---- project + environments + root folders ----
  const slug = `folder-move-fixtures-${alphaNumericNanoId(8).toLowerCase()}`;
  const [project] = await knex(TableName.Project)
    .insert({
      name: "Folder Move Fixtures",
      slug,
      orgId,
      type: ProjectType.SecretManager,
      version: ProjectVersion.V3
    })
    .returning("*");
  const projectId = project.id;

  const envs = await knex(TableName.Environment)
    .insert(
      DEFAULT_PROJECT_ENVS.map(({ name, slug: envSlug }, index) => ({
        name,
        slug: envSlug,
        projectId,
        position: index + 1
      }))
    )
    .returning("*");
  const rootFolders = await knex(TableName.SecretFolder)
    .insert(envs.map(({ id }) => ({ name: "root", envId: id, parentId: null, version: 1 })))
    .returning("*");
  const envBySlug = Object.fromEntries(envs.map((e) => [e.slug, e]));
  const rootByEnvId = Object.fromEntries(rootFolders.map((f) => [f.envId, f]));
  const devEnv = envBySlug.dev;
  const devRootId = rootByEnvId[devEnv.id].id;

  await createUserWithGhostUser(orgId, projectId, userId, knex);

  // project blind index (v3 projects still expect this row)
  const salt = crypto.randomBytes(16).toString("base64");
  const blindIndex = crypto.encryption().symmetric().encryptWithRootEncryptionKey(salt);
  await knex(TableName.SecretBlindIndex).insert({
    projectId,
    encryptedSaltCipherText: blindIndex.ciphertext,
    saltIV: blindIndex.iv,
    saltTag: blindIndex.tag,
    algorithm: blindIndex.algorithm,
    keyEncoding: blindIndex.encoding
  });

  // ---- encryptors ----
  const { encryptor: secretEncryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  const { encryptor: orgEncryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });
  const dummyBlob = (encryptor: typeof secretEncryptor) => encryptor({ plainText: Buffer.from("{}") }).cipherTextBlob;

  // ---- row helpers ----
  const mkFolder = async (envId: string, parentId: string, name: string): Promise<string> => {
    const [folder] = await knex(TableName.SecretFolder).insert({ envId, parentId, name, version: 1 }).returning("*");
    await knex(TableName.SecretFolderVersion).insert({ envId, folderId: folder.id, name, version: 1 });
    return folder.id;
  };

  // creates a chain of nested folders (root -> names[0] -> names[1] -> ...), returning every created id
  const mkChain = async (envId: string, rootId: string, names: string[]): Promise<string[]> => {
    const ids: string[] = [];
    let parentId = rootId;
    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      parentId = await mkFolder(envId, parentId, name);
      ids.push(parentId);
    }
    return ids;
  };

  const mkSecret = async (folderId: string, key: string, value: string) => {
    const encryptedValue = secretEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob;
    const [secret] = await knex(TableName.SecretV2)
      .insert({ key, type: "shared", version: 1, folderId, encryptedValue })
      .returning("*");
    await knex(TableName.SecretVersionV2).insert({
      key,
      type: "shared",
      version: 1,
      secretId: secret.id,
      folderId,
      encryptedValue,
      actorType: "platform"
    });
  };

  // a few static secrets per folder
  const seedSecrets = async (folderId: string, prefix: string) => {
    await mkSecret(folderId, `${prefix}_API_KEY`, `value-${alphaNumericNanoId(8)}`);
    await mkSecret(folderId, `${prefix}_DB_URL`, `postgres://user:pass@host:5432/${prefix.toLowerCase()}`);
  };

  const mkDynamicSecret = async (folderId: string) =>
    knex(TableName.DynamicSecret).insert({
      name: `fixture-dynamic-${alphaNumericNanoId(6)}`,
      version: 1,
      type: "postgres",
      defaultTTL: "1h",
      folderId,
      encryptedInput: dummyBlob(secretEncryptor)
    });

  const mkSecretImport = async (folderId: string) =>
    knex(TableName.SecretImport).insert({
      folderId,
      importPath: "/",
      importEnv: devEnv.id,
      position: 1,
      version: 1
    });

  const mkHoneyToken = async (folderId: string) =>
    knex(TableName.HoneyToken).insert({
      name: `fixture-honey-${alphaNumericNanoId(6)}`,
      type: "postgres",
      status: "active",
      projectId,
      folderId,
      encryptedCredentials: dummyBlob(secretEncryptor),
      secretsMapping: {}
    });

  // secret_rotations_v2.connectionId is a NOT NULL FK, so a rotation needs a prerequisite app connection.
  const [appConnection] = await knex(TableName.AppConnection)
    .insert({
      name: `fixture-pg-${alphaNumericNanoId(6)}`,
      app: "postgres",
      method: "username-and-password",
      encryptedCredentials: dummyBlob(orgEncryptor),
      orgId,
      version: 1
    })
    .returning("*");
  const appConnectionId = appConnection.id;
  const mkSecretRotation = async (folderId: string) => {
    const now = new Date();
    return knex(TableName.SecretRotationV2).insert({
      name: `fixture-rotation-${alphaNumericNanoId(6)}`,
      type: "postgres-credentials",
      parameters: {},
      secretsMapping: {},
      encryptedGeneratedCredentials: dummyBlob(secretEncryptor),
      folderId,
      connectionId: appConnectionId,
      rotationInterval: 86400,
      rotateAtUtc: { hours: 0, minutes: 0 },
      rotationStatus: "success",
      lastRotationAttemptedAt: now,
      lastRotatedAt: now,
      isAutoRotationEnabled: false,
      isLastRotationManual: true
    });
  };

  // ---- scenarios ----
  const scenarios: { path: string; folderId: string; expected: string }[] = [];

  // 1. /movable-deep/a/b/c — pure static secrets, movable
  {
    const [movableRoot, a, b, c] = await mkChain(devEnv.id, devRootId, ["movable-deep", "a", "b", "c"]);
    await seedSecrets(movableRoot, "MOVABLE");
    await seedSecrets(a, "A");
    await seedSecrets(b, "B");
    await seedSecrets(c, "C");
    scenarios.push({ path: "/movable-deep", folderId: movableRoot, expected: "movable" });
  }

  // 2. /blocked-dynamic/sub — blocked by a dynamic secret
  {
    const [root, sub] = await mkChain(devEnv.id, devRootId, ["blocked-dynamic", "sub"]);
    await seedSecrets(root, "BD");
    await mkDynamicSecret(sub);
    scenarios.push({ path: "/blocked-dynamic", folderId: root, expected: "blocked: dynamic_secret" });
  }

  // 3. /blocked-rotation/sub — blocked by a secret rotation
  {
    const [root, sub] = await mkChain(devEnv.id, devRootId, ["blocked-rotation", "sub"]);
    await seedSecrets(root, "BR");
    await mkSecretRotation(sub);
    scenarios.push({ path: "/blocked-rotation", folderId: root, expected: "blocked: secret_rotation" });
  }

  // 4. /blocked-import/sub — blocked by a secret import
  {
    const [root, sub] = await mkChain(devEnv.id, devRootId, ["blocked-import", "sub"]);
    await seedSecrets(root, "BI");
    await mkSecretImport(sub);
    scenarios.push({ path: "/blocked-import", folderId: root, expected: "blocked: secret_import" });
  }

  // 5. /blocked-honey-token/sub — blocked by a honey token
  {
    const [root, sub] = await mkChain(devEnv.id, devRootId, ["blocked-honey-token", "sub"]);
    await seedSecrets(root, "BH");
    await mkHoneyToken(sub);
    scenarios.push({ path: "/blocked-honey-token", folderId: root, expected: "blocked: honey_token" });
  }

  // 6. /blocked-nested/x/y/z — static everywhere, blocker buried in the deepest grandchild
  {
    const [root, x, y, z] = await mkChain(devEnv.id, devRootId, ["blocked-nested", "x", "y", "z"]);
    await seedSecrets(root, "BN");
    await seedSecrets(x, "BNX");
    await seedSecrets(y, "BNY");
    await mkDynamicSecret(z);
    scenarios.push({ path: "/blocked-nested", folderId: root, expected: "blocked: dynamic_secret (deep)" });
  }

  // 7. /dest — empty same-env move destination
  {
    const destId = await mkFolder(devEnv.id, devRootId, "dest");
    scenarios.push({ path: "/dest", folderId: destId, expected: "empty (move destination)" });
  }

  // ---- summary ----
  console.log("\n=== folder move fixtures ===");
  console.log(`  projectId       = ${projectId}`);
  console.log(`  projectSlug     = ${slug}`);
  console.log(`  orgId           = ${orgId}`);
  console.log(`  environments    = dev (source), prod (cross-env destination, env id ${envBySlug.prod.id})`);
  console.log("");
  console.log("  scenarios (env=dev unless noted):");
  for (const s of scenarios) {
    console.log(`    ${s.path.padEnd(22)} folderId=${s.folderId}  -> ${s.expected}`);
  }
  console.log(
    `    prod:/ (root)          folderId=${rootByEnvId[envBySlug.prod.id].id}  -> empty (cross-env destination)`
  );
  console.log("");
  console.log("  try:");
  console.log("    POST   /api/v2/folders/move");
  console.log("    GET    /api/v1/dashboard/folder/move-check/:folderId");
  console.log("");

  await knex.destroy();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
