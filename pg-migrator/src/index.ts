import promptSync from "prompt-sync";
import mongoose, { Model } from "mongoose";
import dotenv from "dotenv";
import knex, { Knex } from "knex";
import path from "path";
import { Level } from "level";
import { packRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";

import {
  APIKeyData,
  BackupPrivateKey,
  Bot,
  BotKey,
  BotOrg,
  Folder,
  FolderVersion,
  GitAppInstallationSession,
  GitAppOrganizationInstallation,
  GitRisks,
  Identity,
  IdentityAccessToken,
  IdentityMembership,
  IdentityMembershipOrg,
  IdentityUniversalAuth,
  IdentityUniversalAuthClientSecret,
  IncidentContactOrg,
  Integration,
  IntegrationAuth,
  Key,
  Membership,
  MembershipOrg,
  Organization,
  Role,
  SSOConfig,
  Secret,
  SecretApprovalPolicy,
  SecretApprovalRequest,
  SecretBlindIndexData,
  SecretImport,
  SecretSnapshot,
  SecretVersion,
  ServiceTokenData,
  Tag,
  TrustedIP,
  User,
  UserAction,
  Webhook,
  Workspace,
} from "./models";
import { TableName } from "./schemas";
import { v4 as uuidV4 } from "uuid";
import { Tables } from "knex/types/tables";
import { ServerConfig } from "./models/serverConfig";
import { flattenFolders } from "./folder";
import { SecretRotation } from "./models/secretRotation";

import { customAlphabet } from "nanoid";

const SLUG_ALPHABETS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const alphaNumericNanoId = customAlphabet(SLUG_ALPHABETS, 10);

enum SecretEncryptionAlgo {
  AES_256_GCM = "aes-256-gcm",
}

const ENV_SLUG_LENGTH = 15;

enum SecretKeyEncoding {
  UTF8 = "utf8",
  BASE64 = "base64",
  HEX = "hex",
}

const kdb = new Level<string, any>("./db", { valueEncoding: "json" });
const getFolderVersionKey = (folderId: string, version: number) =>
  `${folderId}:${version}`;

const projectKv = kdb.sublevel(TableName.Project);
const envPKv = kdb.sublevel(TableName.Environment);

export const getEnvId = (workspace: string, environment: string) => {
  const envKv = envPKv.sublevel(workspace);
  return envKv.get(environment);
};
export const getFolderKv = (workspace: string, environment: string) => {
  const envKv = envPKv.sublevel(workspace);
  return envKv.sublevel(environment);
};

const checkIfFolderIsDangling = async (
  projectId: string,
  env_slug: string,
  folderId: string,
) => {
  const kv = getFolderKv(projectId, truncateAndSlugify(env_slug));
  const result = await kv.get(`${folderId}:dead`).catch(() => null);
  return Boolean(result);
};

const migrationCheckPointsKv = kdb.sublevel("CHECK-POINTS");

export const truncateAndSlugify = (slug: string): string => {
  return slugify(slug.slice(0, ENV_SLUG_LENGTH));
};

/**
 * Sorts an array of items into groups. The return value is a map where the keys are
 * the group ids the given getGroupId function produced and the value is an array of
 * each item in that group.
 */
export const groupBy = <T, Key extends string | number | symbol>(
  array: readonly T[],
  getGroupId: (item: T) => Key,
): Record<Key, T[]> =>
  array.reduce(
    (acc, item) => {
      const groupId = getGroupId(item);
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId].push(item);
      return acc;
    },
    {} as Record<Key, T[]>,
  );

export const migrateCollection = async <
  T extends {},
  K extends keyof Tables,
  R extends (keyof Tables[K]["base"])[] = [],
>({
  db,
  postPgProcessing,
  preProcessing,
  mongooseCollection,
  postgresTableName,
  returnKeys,
  filter,
}: {
  db: Knex;
  returnKeys: R;
  postPgProcessing?: (
    preData: T[],
    data: Pick<Tables[K]["base"], R[number]>[],
  ) => void | Promise<void>;
  preProcessing: (
    data: T,
  ) =>
    | Tables[K]["base"]
    | Tables[K]["base"][]
    | Promise<Tables[K]["base"] | (Tables[K]["base"] | undefined)[] | undefined>
    | undefined;
  postgresTableName: K;
  mongooseCollection: Model<T>;
  filter?: Record<string, any>;
}) => {
  // check ones that have already been migrated
  const migrationCheckPointsKvRes = await migrationCheckPointsKv
    .get(`${postgresTableName}-${mongooseCollection.modelName}`)
    .catch(() => null);

  if (migrationCheckPointsKvRes) {
    console.log(
      `Skipping Postgres table '${postgresTableName}' because of check point`,
    );
    return;
  }

  const mongooseDoc: T[] = [];
  const pgDoc: Tables[K]["base"][] = []; // pre processed data ready to be inserted into PSQL

  console.log(
    "Starting migration of ",
    mongooseCollection.modelName,
    " Postgres table name:",
    postgresTableName,
  );
  const totalMongoCount = await mongooseCollection.countDocuments();
  console.log("Total documents", totalMongoCount);
  console.log("Total batches", Math.ceil(totalMongoCount / 1000));
  let batch = 1;

  for await (const doc of mongooseCollection
    .find(filter || {})
    .cursor({ batchSize: 100 })) {
    mongooseDoc.push(doc);
    const preProcessedData = await preProcessing(
      doc.toObject({ virtuals: true }),
    );
    if (preProcessedData) {
      if (Array.isArray(preProcessedData)) {
        pgDoc.push(
          ...(preProcessedData.filter(Boolean) as Tables[K]["base"][]),
        );
      } else {
        pgDoc.push(preProcessedData);
      }
    }
    if (mongooseDoc.length >= 1000) {
      console.log("Batch No.:", batch);
      if (!pgDoc.length)
        console.log("Skipping this batch due to empty pre processor", batch);
      if (pgDoc.length) {
        const newUserIds = await db.transaction(async (tx) => {
          return (await tx
            .batchInsert<Tables[K]["base"]>(postgresTableName, pgDoc as any)
            .returning(returnKeys as any)) as Pick<
            Tables[K]["base"],
            R[number]
          >[];
        });
        await postPgProcessing?.(mongooseDoc, newUserIds);
      }
      batch += 1;
      mongooseDoc.splice(0, mongooseDoc.length);
      pgDoc.splice(0, pgDoc.length);
    }
  }
  if (mongooseDoc.length) {
    console.log("Batch No.:", batch);
    if (!pgDoc.length)
      console.log("Skipping this batch due to empty pre processor", batch);
    if (pgDoc.length) {
      const newUserIds = await db.transaction(async (tx) => {
        return (await tx
          .batchInsert(postgresTableName, pgDoc as any)
          .returning(returnKeys as any)) as Pick<
          Tables[K]["base"],
          R[number]
        >[];
      });
      await postPgProcessing?.(mongooseDoc, newUserIds);
    }
    batch += 1;
    mongooseDoc.splice(0, mongooseDoc.length);
    pgDoc.splice(0, pgDoc.length);
  }

  migrationCheckPointsKv.put(
    `${postgresTableName}-${mongooseCollection.modelName}`,
    "done",
  );

  console.log(
    "Finished migration of ",
    mongooseCollection.modelName,
    " Postgres table name:",
    postgresTableName,
  );
};

const main = async () => {
  try {
    dotenv.config();

    process.env.START_FRESH = "true";
    const prompt = promptSync({ sigint: true });

    let mongodb_url = process.env.MONGO_DB_URL;
    if (!mongodb_url) {
      mongodb_url = prompt("Type the mongodb url: ");
    }
    console.log("Checking mongoose connection...");
    await mongoose.connect(mongodb_url);
    console.log("Connected successfully to mongo");

    let postgres_url = process.env.POSTGRES_DB_URL;
    if (!postgres_url) {
      postgres_url = prompt("Type the postgres url: ");
    }

    console.log("Checking postgres connection...");
    const db = knex({
      client: "pg",
      connection: postgres_url,
      migrations: {
        directory: path.join(__dirname, "../../backend-pg/src/db/migrations"),
        extension: "ts",
        tableName: "infisical_migrations",
      },
    });
    console.log("Connected successfully to postgres");
    await db.raw("select 1+1 as result");

    if (process.env.START_FRESH === "true") {
      await migrationCheckPointsKv.clear();

      console.log("Starting rolling back to latest, comment this out later");
      await db.migrate.rollback({}, true);
      await kdb.clear();
      console.log("Rolling back completed");

      console.log("Executing migration");
      await db.migrate.latest();
      console.log("Completed migration");
    }

    const userKv = kdb.sublevel(TableName.Users);
    await migrateCollection({
      db,
      mongooseCollection: User,
      postgresTableName: TableName.Users,
      returnKeys: ["id", "email"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        await userKv.put(doc.id.toString(), id);

        return {
          id,
          firstName: doc.firstName,
          email: doc.email,
          devices: JSON.stringify(doc.devices),
          lastName: doc.lastName,
          isAccepted: Boolean(doc.publicKey),
          superAdmin: doc.superAdmin,
          authMethods: doc.authMethods,
          isMfaEnabled: doc.isMfaEnabled,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: User,
      postgresTableName: TableName.UserEncryptionKey,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        if (!doc.publicKey || !doc.encryptedPrivateKey || !doc.iv) return;
        const userId = await userKv.get(doc.id.toString()).catch(() => null);
        if (!userId) return;

        return {
          id,
          iv: doc.iv,
          tag: doc.tag as string,
          salt: doc.salt as string,
          verifier: doc.verifier as string,
          publicKey: doc.publicKey,
          userId,
          protectedKey: doc.protectedKey as string,
          protectedKeyIV: doc.protectedKeyIV as string,
          protectedKeyTag: doc.protectedKeyTag as string,
          encryptedPrivateKey: doc.encryptedPrivateKey as string,
          encryptionVersion: doc.encryptionVersion as number,
          // for change password
          clientPublicKey: null,
          serverPrivateKey: null,
        };
      },
    });
    // skipping user auth token and token sessions
    // lets reset and ask users to login

    await migrateCollection({
      db,
      mongooseCollection: BackupPrivateKey,
      postgresTableName: TableName.BackupPrivateKey,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const userId = await userKv.get(doc.user.toString()).catch(() => null);
        if (!userId) return;

        return {
          id,
          encryptedPrivateKey: doc.encryptedPrivateKey,
          userId,
          verifier: doc.verifier,
          salt: doc.salt,
          tag: doc.tag,
          iv: doc.iv,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
        };
      },
    });

    const orgKv = kdb.sublevel(TableName.Organization);
    await migrateCollection({
      db,
      mongooseCollection: Organization,
      postgresTableName: TableName.Organization,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        await orgKv.put(doc._id.toString(), id);
        return {
          id,
          name: doc.name,
          slug: slugify(`${doc.name}-${alphaNumericNanoId(4)}`),
          customerId: doc.customerId,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
        };
      },
    });

    const orgRoleKv = kdb.sublevel(TableName.OrgRoles);
    await migrateCollection({
      db,
      filter: { isOrgRole: true },
      mongooseCollection: Role,
      postgresTableName: TableName.OrgRoles,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        await orgRoleKv.put(doc._id.toString(), id);
        return {
          id,
          name: doc.name,
          orgId,
          description: doc.description,
          slug: truncateAndSlugify(doc.slug),
          permissions: doc.permissions
            ? JSON.stringify(packRules(doc.permissions as any))
            : null,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: MembershipOrg,
      postgresTableName: TableName.OrgMembership,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        const userId = doc?.user
          ? await userKv.get(doc.user.toString()).catch(() => null)
          : null;
        if (!userId) return;

        const roleId = doc.customRole
          ? await orgRoleKv.get(doc.customRole.toString())
          : null;

        return {
          id,
          role: doc.role,
          orgId,
          roleId,
          userId,
          status: doc.status,
          inviteEmail: doc.inviteEmail,
          createdAt: new Date(doc.createdAt),
          updatedAt: new Date(doc.updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: IncidentContactOrg,
      postgresTableName: TableName.IncidentContact,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        return {
          id,
          email: doc.email,
          orgId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: UserAction,
      postgresTableName: TableName.UserAction,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const userId = await userKv.get(doc.user.toString()).catch(() => null);
        if (!userId) return;

        return {
          id,
          userId,
          action: doc.action,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: ServerConfig,
      postgresTableName: TableName.SuperAdmin,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        return {
          id,
          allowSignUp: doc.allowSignUp,
          initialized: doc.initialized,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: APIKeyData,
      postgresTableName: TableName.ApiKey,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const userId = await userKv.get(doc.user.toString()).catch(() => null);
        if (!userId) return;

        // expired tokens can be removed
        if (new Date(doc.expiresAt) < new Date()) return;
        return {
          id,
          userId,
          name: doc.name,
          lastUsed: doc.lastUsed,
          secretHash: doc.secretHash,
          expiresAt: doc.expiresAt,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: Workspace,
      postgresTableName: TableName.Project,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        await projectKv.put(doc._id.toString(), doc._id.toString());

        // expired tokens can be removed
        // cannot use this uuid for the org id
        return {
          id: doc._id.toString(),
          name: doc.name.slice(0, 60),
          slug: slugify(`${doc.name.slice(0, 60)}-${alphaNumericNanoId(4)}`),
          orgId,
          autoCapitalization: doc.autoCapitalization,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    });

    console.log(
      "Migrating environments from Mongo Project -> Pg Environment Table",
    );
    const envPKv = kdb.sublevel(TableName.Environment);

    const getEnvId = async (workspace: string, environment: string) => {
      const envKv = envPKv.sublevel(workspace);
      return envKv.get(environment);
    };
    const getFolderKv = (workspace: string, environment: string) => {
      const envKv = envPKv.sublevel(workspace);
      return envKv.sublevel(environment);
    };

    await migrateCollection({
      db,
      mongooseCollection: Workspace,
      postgresTableName: TableName.Environment,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        const projectKvRes = await projectKv
          .get(doc._id.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        // to we scope environments into each project then map each slug with respective id
        const envKv = envPKv.sublevel(doc._id.toString());

        // expired tokens can be removed
        // cannot use this uuid for the org id
        return Promise.all(
          doc.environments.map(async (env, index) => {
            const id = uuidV4();
            await envKv.put(truncateAndSlugify(env.slug), id);
            return {
              id,
              name: env.name,
              slug: truncateAndSlugify(env.slug),
              position: index + 1,
              projectId: doc._id.toString(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }),
        );
      },
    });

    console.log("Creating root folders for all environments");
    await migrateCollection({
      db,
      mongooseCollection: Workspace,
      postgresTableName: TableName.SecretFolder,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        let results = [];
        for (const env of doc.environments) {
          const id = uuidV4();

          // case: we forgot to clean up folders that belong to deleted env slugs
          const isEnvFound = await getEnvId(
            doc._id.toString(),
            truncateAndSlugify(env.slug),
          ).catch(() => null);

          if (!isEnvFound) continue;

          const envId = await getEnvId(
            doc._id.toString(),
            truncateAndSlugify(env.slug),
          );

          const folderKv = getFolderKv(
            doc._id.toString(),
            truncateAndSlugify(env.slug),
          );

          await folderKv.put("root", id);
          results.push({
            id,
            name: "root",
            envId,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        return results;
      },
    });

    const projectKeyKv = kdb.sublevel(TableName.ProjectKeys);
    await migrateCollection({
      db,
      mongooseCollection: Key,
      postgresTableName: TableName.ProjectKeys,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        // expired tokens can be removed
        // cannot use this uuid for the org id

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const id = uuidV4();
        await projectKeyKv.put(doc._id.toString(), id);

        const senderId = await userKv
          .get(doc.sender.toString())
          .catch(() => null);
        if (!senderId) return;

        const receiverId = await userKv
          .get(doc.receiver.toString())
          .catch(() => null);
        if (!receiverId) return;

        return {
          id,
          projectId: doc.workspace.toString(),
          senderId,
          nonce: doc.nonce,
          encryptedKey: doc.encryptedKey,
          receiverId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    console.log("Migrating roles from Mongo Project -> Pg Project Role Table");
    const projectRoleKv = kdb.sublevel(TableName.ProjectRoles);
    await migrateCollection({
      db,
      filter: { isOrgRole: false },
      mongooseCollection: Role,
      postgresTableName: TableName.ProjectRoles,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        await projectRoleKv.put(doc._id.toString(), id);
        return {
          id,
          name: doc.name,
          projectId: doc.workspace.toString(),
          description: doc.description,
          slug: truncateAndSlugify(doc.slug),
          permissions: doc.permissions
            ? JSON.stringify(packRules(doc.permissions as any))
            : null,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const projectMembKv = kdb.sublevel(TableName.ProjectMembership);
    await migrateCollection({
      db,
      mongooseCollection: Membership,
      postgresTableName: TableName.ProjectMembership,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const userId = await userKv.get(doc.user.toString()).catch(() => null);
        if (!userId) return;

        const roleId = doc.customRole
          ? await projectRoleKv.get(doc.customRole.toString())
          : null;
        await projectMembKv.put(doc._id.toString(), id);

        return {
          id,
          role: doc.role,
          roleId,
          projectId: doc.workspace.toString(),
          userId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: Folder,
      postgresTableName: TableName.SecretFolder,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        // case: we forgot to clean up folders that belong to deleted env slugs
        const isEnvFound = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        ).catch(() => null);

        if (!isEnvFound) return;

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        const folders = flattenFolders(doc.nodes);
        if (!folders) return;

        const pgFolder = [];
        for (const folder of folders) {
          if (folder.id !== "root") {
            const { name, version } = folder;
            const id = uuidV4();
            await folderKv.put(folder.id, id);
            const parentId = folder?.parentId
              ? await folderKv.get(folder?.parentId).catch((e) => {
                  console.log("parent folder not found==>", folder);
                  throw e;
                })
              : null;

            pgFolder.push({
              name,
              version,
              id,
              parentId,
              envId,
              createdAt: (doc as any).createdAt,
              updatedAt: (doc as any).updatedAt,
            });
          }
        }

        return pgFolder;
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: FolderVersion,
      postgresTableName: TableName.SecretFolderVersion,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        // looping through env, we can come across envs that do not exist in the present state.
        // This is because some folder snap shots were taken when that env slug exists but the same env slug was later deleted
        let envId: string;
        try {
          const isEnvFound = await getEnvId(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
          ).catch(() => null);
          if (!isEnvFound) return;

          envId = await getEnvId(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
          );
        } catch (e) {
          return;
        }

        const rootFolders = (doc?.nodes?.children || []).map(
          ({ name, version, id }) => ({
            name,
            version,
            id,
          }),
        );

        const pgFolder = await Promise.all(
          rootFolders.map(async (folder) => {
            const { name, version } = folder;
            const id = uuidV4();

            await folderKv.put(getFolderVersionKey(folder.id, version), id);

            // we are looking for each folder in folder versions and some we might not see
            // because folderKv is ony keeps track of folders that are present in dashboard. So those we don't find, we'll add to same kv but add prefix `dead`.
            // This way, we can handle dead ones we encounter in the future
            const folderId = await folderKv.get(folder.id).catch(async () => {
              const newFolderId = uuidV4();
              await folderKv.put(`${folder.id}:dead`, id); // we are adding dead folders that are not present in dashboard
              return newFolderId;
            });

            return {
              name,
              version,
              id,
              folderId,
              envId,
              createdAt: (doc as any).createdAt,
              updatedAt: (doc as any).updatedAt,
            };
          }),
        );

        return pgFolder;
      },
    });

    const secretImportKv = kdb.sublevel(TableName.SecretImport);
    await migrateCollection({
      db,
      mongooseCollection: SecretImport,
      postgresTableName: TableName.SecretImport,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const envKv = envPKv.sublevel(doc.workspace.toString());

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        if (
          await checkIfFolderIsDangling(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
            doc.folderId,
          )
        ) {
          return;
        }

        // case: when import is created for a given folder and later the folder is deleted AND the import with that folder ref is not deleted THEN this folder won't exist?? :(
        const folderId = await folderKv.get(doc.folderId).catch(() => null);

        if (!folderId) return;

        return Promise.all(
          doc.imports
            .map(async ({ environment, secretPath }, index) => {
              const id = uuidV4();
              // case: when import is created but later the env slug is deleted HOWEVER the import with that env slug was not deleted :(
              const importEnv = await envKv
                .get(truncateAndSlugify(environment))
                .catch(() => null);
              if (!importEnv) return;

              return {
                id,
                folderId,
                position: index + 1,
                version: 1,
                createdAt: new Date((doc as any).createdAt),
                updatedAt: new Date((doc as any).updatedAt),
                importEnv,
                importPath: secretPath,
              };
            })
            .filter(Boolean),
        );
      },
    });

    const tagKv = kdb.sublevel(TableName.SecretTag);
    await migrateCollection({
      db,
      mongooseCollection: Tag,
      postgresTableName: TableName.SecretTag,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        await tagKv.put(doc._id.toString(), id);

        // skip tags that have slugs that are empty
        if (doc.slug.length < 1) {
          return;
        }

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const createdBy = await userKv
          .get(doc.user.toString())
          .catch(() => null);
        if (!createdBy) return;

        return {
          id,
          name: doc.name,
          slug: truncateAndSlugify(doc.slug),
          color: doc.tagColor,
          projectId: doc.workspace.toString(),
          createdBy: createdBy || null,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: SecretBlindIndexData,
      postgresTableName: TableName.SecretBlindIndex,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        return {
          id,
          projectId: doc.workspace.toString(),
          saltIV: doc.saltIV,
          saltTag: doc.saltTag,
          algorithm: doc.algorithm,
          keyEncoding: doc.keyEncoding,
          encryptedSaltCipherText: doc.encryptedSaltCiphertext,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    });

    const secKv = kdb.sublevel(TableName.Secret);
    await migrateCollection({
      db,
      mongooseCollection: Secret,
      postgresTableName: TableName.Secret,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        // when env slug is empty
        if (doc.environment.length < 1) {
          return;
        }

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        // case: we forgot to clean up secrets that belong to deleted env slugs
        const isEnvFound = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        ).catch(() => null);
        if (!isEnvFound) return;

        if (
          await checkIfFolderIsDangling(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
            doc.folder as string,
          )
        ) {
          return;
        }

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        // Case: if folder id doesn't exist and the root of the folder also doesn;t exist, THEN put the secret at the ROOT
        // case: after deleting a folder, we don't clean up the secrets that link to that folder
        const folderId = await folderKv
          .get(doc.folder || "root")
          .catch(() => null);

        // case: when environments are renamed, there used to be a TIMEE when the related folder's slugs weren't updated with it... :(
        if (!folderId) return;

        // issue with personal
        const userId = doc.user
          ? await userKv.get(doc.user.toString()).catch(() => null)
          : null;

        if (doc.type === "personal" && !userId) return;

        const id = uuidV4();
        await secKv.put(doc._id.toString(), id);

        return {
          id,
          keyEncoding: doc.keyEncoding,
          algorithm: doc.algorithm,
          folderId,
          type: doc.type,
          version: doc.version,
          secretReminderRepeatDays: doc.secretReminderRepeatDays,
          userId,
          metadata: doc.metadata,
          secretKeyIV: doc.secretKeyIV,
          secretKeyTag: doc.secretKeyTag,
          secretKeyCiphertext: doc.secretKeyCiphertext,
          secretValueIV: doc.secretValueIV,
          secretValueTag: doc.secretValueTag,
          secretValueCiphertext: doc.secretValueCiphertext,
          secretBlindIndex: doc.secretBlindIndex,
          secretCommentIV: doc.secretCommentIV,
          secretCommentTag: doc.secretCommentTag,
          secretCommentCiphertext: doc.secretCommentCiphertext,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    console.log(
      "Migrating secret tags from Mongo Secret.tags -> Pg SecretTag table",
    );
    await migrateCollection({
      db,
      mongooseCollection: Secret,
      postgresTableName: TableName.JnSecretTag,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        return Promise.all(
          (doc.tags || [])?.map(async (tagId) => {
            const id = uuidV4();

            const projectKvRes = await projectKv
              .get(doc.workspace.toString())
              .catch(() => null);
            if (!projectKvRes) return;

            // case: we forgot to clean up secrets that belong to deleted env slugs
            const isEnvFound = await getEnvId(
              doc.workspace.toString(),
              truncateAndSlugify(doc.environment),
            ).catch(() => null);
            if (!isEnvFound) return;

            if (
              await checkIfFolderIsDangling(
                doc.workspace.toString(),
                truncateAndSlugify(doc.environment),
                doc.folder as string,
              )
            ) {
              return;
            }

            // const userId = doc.user
            //   ? await userKv.get(doc.user.toString()).catch(() => null)
            //   : null;
            // if (!userId) return;

            const secretId = await secKv.get(doc._id.toString()).catch((e) => {
              throw e;
            });
            const secretTagId = await tagKv.get(tagId).catch((e) => {
              throw e;
            });
            return {
              id,
              [`${TableName.Secret}Id`]: secretId,
              [`${TableName.SecretTag}Id`]: secretTagId,
              // createdAt: new Date((doc as any).createdAt),
              // updatedAt: new Date((doc as any).updatedAt),
            };
          }),
        );
      },
    });

    const secVerKv = kdb.sublevel(TableName.SecretVersion);
    await migrateCollection({
      db,
      mongooseCollection: SecretVersion,
      postgresTableName: TableName.SecretVersion,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        // when env slug is empty
        if (doc.environment.length < 1) {
          return;
        }

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        // case: we forgot to clean up secrets that belong to deleted env slugs
        const isEnvFound = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        ).catch(() => null);
        if (!isEnvFound) return;

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        if (
          await checkIfFolderIsDangling(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
            doc.folder as string,
          )
        ) {
          return;
        }

        // Case: if folder id doesn't exist and the root of the folder also doesn;t exist, THEN put the secret at the ROOT
        const folderId = await folderKv
          .get(doc.folder || "root")
          .catch(async () => {
            console.log(
              "secret location unknown, moving secret to root of env_slug/project",
            );
            return await folderKv.get("root");
          });

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        const userId = doc.user
          ? await userKv.get(doc.user.toString()).catch(() => null)
          : null;
        if (!userId && doc.type === "personal") return;

        const id = uuidV4();
        await secVerKv.put(doc._id.toString(), id);
        const secretId = await secKv
          .get(doc.secret.toString())
          .catch(async (e) => {
            const newId = uuidV4();
            await secKv.put(`${doc.secret.toString()}:dead`, newId);
            return newId;
          });

        // comment and reminder are not saved in secret version of mongo
        return {
          id,
          keyEncoding: doc.keyEncoding,
          algorithm: doc.algorithm,
          folderId,
          envId,
          type: doc.type,
          version: doc.version,
          userId,
          secretId,
          secretKeyIV: doc.secretKeyIV,
          secretKeyTag: doc.secretKeyTag,
          secretKeyCiphertext: doc.secretKeyCiphertext,
          secretValueIV: doc.secretValueIV,
          secretValueTag: doc.secretValueTag,
          secretValueCiphertext: doc.secretValueCiphertext,
          secretBlindIndex: doc.secretBlindIndex,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const projectBotKv = kdb.sublevel(TableName.ProjectBot);
    await migrateCollection({
      db,
      mongooseCollection: Bot,
      postgresTableName: TableName.ProjectBot,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        // if we try to process two bots for the same workspace, then skip
        if (
          await projectBotKv.get(doc.workspace.toString()).catch(() => null)
        ) {
          return;
        }

        await projectBotKv.put(doc.workspace.toString(), id);

        // case: skip bots that are inactive (skipped specifically because 6388653a200193a667c7e3f3 has two records, one active one not)
        let bot = await Bot.findOne({
          workspace: doc.workspace,
          $or: [{ isActive: true }, { isActive: false }],
        })
          .sort({ isActive: -1 })
          .lean();

        // case: when no bots are found for this project, skip
        if (!bot) return;

        const botKey = await BotKey.findOne({ bot: bot?._id });

        const senderId = botKey?.sender
          ? await userKv.get(botKey.sender.toString()).catch(() => null)
          : null;

        if (!senderId) return;

        return {
          id,
          algorithm: bot.algorithm,
          keyEncoding: bot.keyEncoding,
          projectId: bot.workspace.toString(),
          name: bot.name,
          iv: bot.iv,
          tag: bot.tag,
          senderId,
          isActive: bot.isActive,
          publicKey: bot.publicKey,
          encryptedProjectKey: botKey?.encryptedKey || null,
          encryptedProjectKeyNonce: botKey?.nonce || null,
          encryptedPrivateKey: bot.encryptedPrivateKey,
          createdAt: new Date((bot as any).createdAt),
          updatedAt: new Date((bot as any).updatedAt),
        };
      },
    });

    const integrationAuthKv = kdb.sublevel(TableName.IntegrationAuth);
    await migrateCollection({
      db,
      mongooseCollection: IntegrationAuth,
      postgresTableName: TableName.IntegrationAuth,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        await integrationAuthKv.put(doc._id.toString(), id);

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        return {
          id,
          projectId: doc.workspace.toString(),
          keyEncoding: doc.keyEncoding || SecretKeyEncoding.UTF8,
          algorithm: doc.algorithm || SecretEncryptionAlgo.AES_256_GCM,
          metadata: doc.metadata,
          url: doc.url,
          teamId: doc.teamId,
          accessIV: doc.accessIV,
          accessTag: doc.accessTag,
          accessCiphertext: doc.accessCiphertext,
          accountId: doc.accountId,
          namespace: doc.namespace,
          refreshIV: doc.refreshIV,
          refreshTag: doc.refreshTag,
          refreshCiphertext: doc.refreshCiphertext,
          integration: doc.integration,
          accessIdIV: doc.accessIdIV,
          accessIdTag: doc.accessIdTag,
          accessIdCiphertext: doc.accessIdCiphertext,
          accessExpiresAt: doc.accessExpiresAt,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const integrationKv = kdb.sublevel(TableName.Integration);
    await migrateCollection({
      db,
      mongooseCollection: Integration,
      postgresTableName: TableName.Integration,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );
        const integrationAuthId = await integrationAuthKv.get(
          doc.integrationAuth.toString(),
        );
        await integrationKv.put(doc._id.toString(), id);

        return {
          id,
          integration: doc.integration,
          url: doc.url,
          metadata: doc.metadata,
          isActive: doc.isActive,
          secretPath: doc.secretPath,
          integrationAuthId,
          app: doc.app,
          envId,
          path: doc.path,
          appId: doc.appId,
          owner: doc.owner,
          scope: doc.scope,
          region: doc.region,
          targetService: doc.targetService,
          targetServiceId: doc.targetServiceId,
          targetEnvironment: doc.targetEnvironment,
          targetEnvironmentId: doc.targetEnvironmentId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: ServiceTokenData,
      postgresTableName: TableName.ServiceToken,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const userId = await userKv.get(doc.user.toString()).catch(() => null);
        if (!userId) return;

        return {
          id: doc._id.toString(),
          projectId: doc.workspace.toString(),
          name: doc.name,
          createdBy: userId,
          iv: doc.iv,
          tag: doc.tag,
          scopes: JSON.stringify(doc.scopes),
          lastUsed: doc.lastUsed,
          secretHash: doc.secretHash,
          expiresAt: doc.expiresAt,
          permissions: doc.permissions,
          encryptedKey: doc.encryptedKey,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const webhookKv = kdb.sublevel(TableName.Webhook);
    await migrateCollection({
      db,
      mongooseCollection: Webhook,
      postgresTableName: TableName.Webhook,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );
        await webhookKv.put(doc._id.toString(), id);
        return {
          id,
          iv: doc.iv,
          envId,
          secretPath: doc.secretPath,
          url: doc.url,
          algorithm: doc.algorithm || SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: doc.keyEncoding || SecretKeyEncoding.UTF8,
          tag: doc.tag,
          isDisabled: doc.isDisabled,
          lastStatus: doc.lastStatus,
          encryptedSecretKey: doc.encryptedSecretKey,
          lastRunErrorMessage: doc.lastRunErrorMessage,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const identityKv = kdb.sublevel(TableName.Identity);
    await migrateCollection({
      db,
      mongooseCollection: Identity,
      postgresTableName: TableName.Identity,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        await identityKv.put(doc._id.toString(), id);
        return {
          id,
          name: doc.name,
          authMethod: doc.authMethod,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const identityUaKv = kdb.sublevel(TableName.IdentityUniversalAuth);
    await migrateCollection({
      db,
      mongooseCollection: IdentityUniversalAuth,
      postgresTableName: TableName.IdentityUniversalAuth,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const identityId = await identityKv.get(doc.identity.toString());
        await identityUaKv.put(doc._id.toString(), id);
        return {
          id,
          identityId,
          clientId: doc.clientId,
          accessTokenTTL: doc.accessTokenTTL,
          accessTokenMaxTTL: doc.accessTokenMaxTTL,
          accessTokenTrustedIps: JSON.stringify(
            doc.accessTokenTrustedIps || [],
          ),
          accessTokenNumUsesLimit: doc.accessTokenNumUsesLimit,
          clientSecretTrustedIps: JSON.stringify(
            doc.clientSecretTrustedIps || [],
          ),
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const identityUaClientSecKv = kdb.sublevel(
      TableName.IdentityUaClientSecret,
    );
    await migrateCollection({
      db,
      mongooseCollection: IdentityUniversalAuthClientSecret,
      postgresTableName: TableName.IdentityUaClientSecret,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const identityUAId = await identityUaKv.get(
          doc.identityUniversalAuth.toString(),
        );
        await identityUaClientSecKv.put(doc._id.toString(), doc._id.toString());
        return {
          id: doc._id.toString(),
          identityUAId,
          description: doc.description,
          clientSecretTTL: doc.clientSecretTTL,
          clientSecretHash: doc.clientSecretHash,
          clientSecretPrefix: doc.clientSecretPrefix,
          clientSecretNumUses: doc.clientSecretNumUses,
          isClientSecretRevoked: doc.isClientSecretRevoked,
          clientSecretLastUsedAt: doc.clientSecretLastUsedAt,
          clientSecretNumUsesLimit: doc.clientSecretNumUsesLimit,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const identityAccessTokenKv = kdb.sublevel(TableName.IdentityAccessToken);
    await migrateCollection({
      db,
      mongooseCollection: IdentityAccessToken,
      postgresTableName: TableName.IdentityAccessToken,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        await identityAccessTokenKv.put(doc._id.toString(), id);
        const identityUAClientSecretId = doc?.identityUniversalAuthClientSecret
          ? await identityUaClientSecKv.get(
              doc.identityUniversalAuthClientSecret.toString(),
            )
          : null;
        const identityId = await identityKv.get(doc.identity.toString());
        return {
          id,
          accessTokenNumUsesLimit: doc.accessTokenNumUsesLimit,
          accessTokenMaxTTL: doc.accessTokenMaxTTL,
          accessTokenTTL: doc.accessTokenTTL,
          identityId,
          accessTokenNumUses: doc.accessTokenNumUses,
          isAccessTokenRevoked: doc.isAccessTokenRevoked,
          accessTokenLastUsedAt: doc.accessTokenLastUsedAt,
          accessTokenLastRenewedAt: doc.accessTokenLastRenewedAt,
          identityUAClientSecretId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: IdentityMembershipOrg,
      postgresTableName: TableName.IdentityOrgMembership,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        const identityId = await identityKv.get(doc.identity.toString());
        const roleId = doc.customRole
          ? await orgRoleKv.get(doc.customRole.toString())
          : null;

        return {
          id,
          role: doc.role,
          orgId,
          identityId,
          roleId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: IdentityMembership,
      postgresTableName: TableName.IdentityProjectMembership,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const identityId = await identityKv.get(doc.identity.toString());
        const roleId = doc.customRole
          ? await projectRoleKv.get(doc.customRole.toString())
          : null;

        return {
          id,
          role: doc.role,
          identityId,
          projectId: doc.workspace.toString(),
          roleId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const sapKv = kdb.sublevel(TableName.SecretApprovalPolicy);
    await migrateCollection({
      db,
      mongooseCollection: SecretApprovalPolicy,
      postgresTableName: TableName.SecretApprovalPolicy,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );
        await sapKv.put(doc._id.toString(), id);

        return {
          id,
          name: doc.name,
          envId,
          approvals: doc.approvals,
          secretPath: doc.secretPath,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    console.log(
      "Migration secret approval policy approvers -> Pg sap approvers table",
    );
    await migrateCollection({
      db,
      mongooseCollection: SecretApprovalPolicy,
      postgresTableName: TableName.SecretApprovalPolicyApprover,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const policyId = await sapKv.get(doc._id.toString());

        return Promise.all(
          doc.approvers.map(async (membId) => {
            const id = uuidV4();
            const approverId = await projectMembKv.get(membId.toString());
            return {
              id,
              policyId,
              approverId,
              createdAt: new Date((doc as any).createdAt),
              updatedAt: new Date((doc as any).updatedAt),
            };
          }),
        );
      },
    });

    const secRotationKv = kdb.sublevel(TableName.SecretRotation);
    await migrateCollection({
      db,
      mongooseCollection: SecretRotation,
      postgresTableName: TableName.SecretRotation,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        await secRotationKv.put(doc._id.toString(), id);

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        return {
          id,
          envId,
          keyEncoding: doc.keyEncoding,
          algorithm: doc.algorithm,
          secretPath: doc.secretPath,
          status: doc.status,
          interval: doc.interval,
          provider: doc.provider,
          encryptedData: doc.encryptedData,
          encryptedDataIV: doc.encryptedDataIV,
          encryptedDataTag: doc.encryptedDataTag,
          lastRotatedAt: doc.lastRotatedAt ? new Date(doc.lastRotatedAt) : null,
          statusMessage: doc.statusMessage,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    console.log(
      "Migration secret rotation outputs from mongo to postgres secret rotation output table",
    );
    await migrateCollection({
      db,
      mongooseCollection: SecretRotation,
      postgresTableName: TableName.SecretRotationOutput,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const rotationId = await secRotationKv.get(doc._id.toString());

        return Promise.all(
          doc.outputs.map(async ({ key, secret }) => {
            const secretId = await secKv
              .get(secret.toString())
              .catch(() => null);
            if (!secretId) return;

            return {
              id,
              key,
              secretId,
              rotationId,
            };
          }),
        );
      },
    });

    const ssoConfigKv = kdb.sublevel(TableName.SamlConfig);
    await migrateCollection({
      db,
      mongooseCollection: SSOConfig,
      postgresTableName: TableName.SamlConfig,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        // case: when a org has two SSO configs, one with encryptedEntryPoint defined should be taken. Others skipped
        if (!doc.encryptedEntryPoint) {
          return;
        }

        await ssoConfigKv.put(orgId.toString(), "true");

        return {
          id,
          isActive: doc.isActive,
          orgId,
          certIV: doc.certIV,
          certTag: doc.certTag,
          issuerIV: doc.issuerIV,
          issuerTag: doc.issuerTag,
          authProvider: doc.authProvider,
          entryPointIV: doc.entryPointIV,
          entryPointTag: doc.entryPointTag,
          encryptedEntryPoint: doc.encryptedEntryPoint,
          encryptedCert: doc.encryptedCert,
          encryptedIssuer: doc.encryptedIssuer,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const botOrgsProcessed = kdb.sublevel(TableName.OrgBot);
    await migrateCollection({
      db,
      mongooseCollection: BotOrg,
      postgresTableName: TableName.OrgBot,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        // case: race condition where there are multiple org bots, we only take one
        const botOrgsProcessedRes = await botOrgsProcessed
          .get(orgId)
          .catch(() => null);
        if (botOrgsProcessedRes) {
          return;
        }

        const ssoConfigRes = await ssoConfigKv.get(orgId).catch(() => null);
        if (!ssoConfigRes) {
          return;
        }

        await botOrgsProcessed.put(orgId, "true");

        return {
          id,
          orgId,
          name: doc.name,
          encryptedPrivateKey: doc.encryptedPrivateKey,
          publicKey: doc.publicKey,
          privateKeyIV: doc.privateKeyIV,
          privateKeyTag: doc.privateKeyTag,
          symmetricKeyIV: doc.symmetricKeyIV,
          symmetricKeyTag: doc.symmetricKeyTag,
          privateKeyAlgorithm: doc.privateKeyAlgorithm,
          encryptedSymmetricKey: doc.encryptedSymmetricKey,
          privateKeyKeyEncoding: doc.privateKeyKeyEncoding,
          symmetricKeyAlgorithm: doc.symmetricKeyAlgorithm,
          symmetricKeyKeyEncoding: doc.symmetricKeyKeyEncoding,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: GitAppInstallationSession,
      postgresTableName: TableName.GitAppInstallSession,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organization
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        const userId = await userKv.get(doc.user.toString()).catch(() => null);
        if (!userId) return;

        return {
          id,
          orgId,
          userId,
          sessionId: doc.sessionId,
          createdAt: (doc as any)?.createdAt
            ? new Date((doc as any).createdAt)
            : new Date(),
          updatedAt: (doc as any)?.updatedAt
            ? new Date((doc as any).updatedAt)
            : new Date(),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: GitAppOrganizationInstallation,
      postgresTableName: TableName.GitAppOrg,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organizationId.toString()
          ? await orgKv.get(doc.organizationId.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        const userId = await userKv.get(doc.user.toString()).catch(() => null);
        if (!userId) return;

        return {
          id,
          orgId,
          userId,
          installationId: doc.installationId,
          createdAt: (doc as any)?.createdAt
            ? new Date((doc as any).createdAt)
            : new Date(),
          updatedAt: (doc as any)?.updatedAt
            ? new Date((doc as any).updatedAt)
            : new Date(),
        };
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: GitRisks,
      postgresTableName: TableName.SecretScanningGitRisk,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const orgId = doc?.organization.toString()
          ? await orgKv.get(doc.organization.toString()).catch(() => null)
          : null;
        if (!orgId) return;

        return {
          id,
          orgId,
          installationId: doc.installationId,
          status: doc.status,
          tags: doc.tags,
          date: doc.date,
          file: doc.file,
          email: doc.email,
          author: doc.author,
          commit: doc.commit,
          ruleID: doc.ruleID,
          endLine: doc.endLine,
          entropy: doc.entropy,
          message: doc.message,
          endColumn: doc.endColumn,
          riskOwner: doc.riskOwner,
          startLine: doc.startLine,
          isResolved: doc.isResolved,
          pusherName: doc.pusher?.name,
          description: doc.description,
          fingerprint: doc.fingerprint,
          fingerPrintWithoutCommitId: doc.fingerPrintWithoutCommitId,
          pusherEmail: doc.pusher?.email,
          startColumn: doc.startColumn,
          symlinkFile: doc.symlinkFile,
          repositoryId: doc.repositoryId,
          repositoryLink: doc.repositoryLink,
          isFalsePositive: doc.isFalsePositive,
          repositoryFullName: doc.repositoryFullName,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const trustedIpKv = kdb.sublevel(TableName.TrustedIps);
    await migrateCollection({
      db,
      mongooseCollection: TrustedIP,
      postgresTableName: TableName.TrustedIps,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;
        await trustedIpKv.put(doc._id.toString(), id);

        return {
          id,
          projectId: doc.workspace.toString(),
          type: doc.type,
          prefix: doc.prefix,
          comment: doc.comment,
          ipAddress: doc.ipAddress,
          isActive: doc.isActive,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    const snapKv = kdb.sublevel(TableName.Snapshot);
    await migrateCollection({
      db,
      mongooseCollection: SecretSnapshot,
      postgresTableName: TableName.Snapshot,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        await snapKv.put(doc._id.toString(), id);

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const envKv = envPKv.sublevel(doc.workspace.toString());

        // case: env was deleted but still links snapshot, so we don't need it
        if (
          !(await envKv
            .get(truncateAndSlugify(doc.environment))
            .catch(() => null))
        ) {
          return;
        }

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        if (
          await checkIfFolderIsDangling(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
            doc.folderId,
          )
        ) {
          return;
        }

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );
        // const folderKv = getFolderKv(doc.workspace.toString(), truncateAndSlugify(doc.environment));
        const folderId = await folderKv.get(doc.folderId).catch(async () => {
          // this folder may not exist now in tree then create a new id and assign it
          const newId = uuidV4();
          await folderKv.put(doc.folderId, newId);
          return newId;
        });

        return {
          id,
          envId,
          folderId,
          createdAt: (doc as any).createdAt,
          updatedAt: (doc as any).updatedAt,
        };
      },
    });

    console.log("Migrating secret snapshot secrets");
    await migrateCollection({
      db,
      mongooseCollection: SecretSnapshot,
      postgresTableName: TableName.SnapshotSecret,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const snapshotId = await snapKv.get(doc._id.toString());

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        const envKv = envPKv.sublevel(doc.workspace.toString());

        // case: env was deleted but still links snapshot, so we don't need it
        if (
          !(await envKv
            .get(truncateAndSlugify(doc.environment))
            .catch(() => null))
        ) {
          return;
        }

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        return Promise.all(
          doc.secretVersions
            .map(async (secVer) => {
              const id = uuidV4();

              // case: for secret versions that have been discarded, skip creating a snapshot for it
              const secretVersionId = await secVerKv
                .get(secVer.toString())
                .catch(() => null);
              if (!secretVersionId) return;

              return {
                id,
                envId,
                snapshotId,
                secretVersionId,
                createdAt: (doc as any).createdAt,
                updatedAt: (doc as any).updatedAt,
              };
            })
            .filter(Boolean),
        );
      },
    });

    console.log("Migrating secret snapshot folders");
    await migrateCollection({
      db,
      mongooseCollection: SecretSnapshot,
      postgresTableName: TableName.SnapshotFolder,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const snapshotId = await snapKv.get(doc._id.toString());

        if (!doc.folderVersion) return;

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        // case: we forgot to clean up secrets that belong to deleted env slugs
        const isEnvFound = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        ).catch(() => null);
        if (!isEnvFound) return;

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        if (
          await checkIfFolderIsDangling(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
            doc.folderId,
          )
        ) {
          return;
        }

        const envId = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        const folderVersion = await FolderVersion.findById(doc.folderVersion);

        if (!folderVersion) return;

        return Promise.all(
          folderVersion.nodes.children.map(async (folderVer) => {
            const id = uuidV4();
            const folderVersionId = await folderKv.get(
              getFolderVersionKey(folderVer.id, folderVer.version),
            );
            return {
              id,
              envId,
              snapshotId,
              folderVersionId,
              createdAt: (doc as any).createdAt,
              updatedAt: (doc as any).updatedAt,
            };
          }),
        );
      },
    });

    const sarKv = kdb.sublevel(TableName.SecretApprovalRequest);
    await migrateCollection({
      db,
      mongooseCollection: SecretApprovalRequest,
      postgresTableName: TableName.SecretApprovalRequest,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

        // case: when the policy has been deleted, the request should also be deleted
        const policyId = await sapKv
          .get(doc.policy.toString())
          .catch(() => null);
        if (!policyId) return;

        const projectKvRes = await projectKv
          .get(doc.workspace.toString())
          .catch(() => null);
        if (!projectKvRes) return;

        // case: we forgot to clean up secrets that belong to deleted env slugs
        const isEnvFound = await getEnvId(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        ).catch(() => null);
        if (!isEnvFound) return;

        const folderKv = getFolderKv(
          doc.workspace.toString(),
          truncateAndSlugify(doc.environment),
        );

        if (
          await checkIfFolderIsDangling(
            doc.workspace.toString(),
            truncateAndSlugify(doc.environment),
            doc.folderId,
          )
        ) {
          return;
        }

        // Case: if folder id doesn't exist and the root of the folder also doesn't exist, THEN put the secret at the ROOT
        const folderId = await folderKv
          .get(doc.folderId || "root")
          .catch(async () => {
            console.log(
              `${TableName.SecretApprovalRequest}: secret location unknown, moving secret to root of env_slug/project`,
            );
            return await folderKv.get("root");
          });

        // case: when the committer has been removed from Infisical, we should delete all of their requests (past and preset).
        const committerId = await projectMembKv
          .get(doc.committer.toString())
          .catch(() => null);
        if (!committerId) return;

        await sarKv.put(doc._id.toString(), id);

        const statusChangeBy = doc.statusChangeBy
          ? await projectMembKv
              .get(doc.statusChangeBy.toString())
              .catch(() => null)
          : null;
        return {
          id,
          policyId,
          hasMerged: doc.hasMerged,
          status: doc.status,
          conflicts: JSON.stringify(doc.conflicts),
          slug: truncateAndSlugify(doc.slug),
          folderId,
          committerId,
          statusChangeBy,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
        };
      },
    });

    console.log(
      "Migrating Mongo Secret approval request reviewers -> Pg Secret Approval Request reviewers table",
    );
    await migrateCollection({
      db,
      mongooseCollection: SecretApprovalRequest,
      postgresTableName: TableName.SecretApprovalRequestReviewer,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const requestId = await sarKv.get(doc._id.toString()).catch(() => null);
        if (!requestId) return;

        return Promise.all(
          doc.reviewers.map(async ({ status, member }) => {
            return {
              id,
              status,
              requestId,
              member: await projectMembKv.get(member.toString()),
              createdAt: new Date((doc as any).createdAt),
              updatedAt: new Date((doc as any).updatedAt),
            };
          }),
        );
      },
    });

    // console.log(
    //   "Migrating Mongo Secret approval request secrets -> Pg Secret Approval Request secrets table",
    // );
    // await migrateCollection({
    //   db,
    //   mongooseCollection: SecretApprovalRequest,
    //   postgresTableName: TableName.SarSecret,
    //   returnKeys: ["id"],
    //   preProcessing: async (doc) => {
    //     const id = uuidV4();
    //     const requestId = await sarKv.get(doc._id.toString());
    //
    //     return Promise.all(
    //       doc.commits.map(async (commit) => {
    //         if (commit.op === CommitType.CREATE) {
    //           return {
    //             id,
    //             requestId,
    //             secretBlindIndex: commit.newVersion.secretBlindIndex,
    //             createdAt: new Date((doc as any).createdAt),
    //             updatedAt: new Date((doc as any).updatedAt),
    //           };
    //         }
    //       }),
    //     );
    //   },
    // });

    console.log("MIGRATION SCRIPT COMPLETED SUCCESSFULLY");
    process.exit(1);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

main();
