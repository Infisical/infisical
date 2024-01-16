import promptSync from "prompt-sync";
import mongoose, { Model } from "mongoose";
import dotenv from "dotenv";
import knex, { Knex } from "knex";
import path from "path";
import { Level } from "level";
import { packRules } from "@casl/ability/extra";
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

enum SecretEncryptionAlgo {
  AES_256_GCM = "aes-256-gcm",
}

enum SecretKeyEncoding {
  UTF8 = "utf8",
  BASE64 = "base64",
  HEX = "hex",
}

const kdb = new Level<string, any>("./db", { valueEncoding: "json" });
const getFolderVersionKey = (folderId: string, version: number) =>
  `${folderId}:${version}`;
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

const migrateCollection = async <
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
  const mongooseDoc: T[] = [];
  const pgDoc: Tables[K]["base"][] = [];

  console.log("Starting migration of ", mongooseCollection.modelName);
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
      mongooseDoc.slice(0, mongooseDoc.length);
      pgDoc.slice(0, pgDoc.length);
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
    mongooseDoc.slice(0, mongooseDoc.length);
    pgDoc.slice(0, pgDoc.length);
  }

  console.log("Finished migration of ", mongooseCollection.modelName);
};

const main = async () => {
  try {
    dotenv.config();
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
      postgres_url = prompt("Type the mongodb url: ");
    }

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
    console.log("Connected successfully to postgres");
    await db.raw("select 1+1 as result");

    console.log("Starting rolling back to latest, comment this out later");
    await db.migrate.rollback({}, true);
    kdb.clear();
    console.log("Rolling back completed");

    console.log("Executing migration");
    await db.migrate.latest();
    console.log("Completed migration");

    const userKv = kdb.sublevel(TableName.Users);
    await migrateCollection({
      db,
      mongooseCollection: User,
      postgresTableName: TableName.Users,
      returnKeys: ["id", "email"],
      preProcessing: (doc) => {
        const id = uuidV4();
        userKv.put(doc.id, id);
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
        const userId = await userKv.get(doc.id.toString());

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
        const userId = await userKv.get(doc.user.toString());

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
        const orgId = await orgKv.get(doc.organization.toString());
        await orgRoleKv.put(doc._id.toString(), id);
        return {
          id,
          name: doc.name,
          orgId,
          description: doc.description,
          slug: doc.slug,
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
        const orgId = await orgKv.get(doc.organization.toString());
        const userId = doc?.user ? await userKv.get(doc.user.toString()) : null;
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
        const orgId = await orgKv.get(doc.organization.toString());
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
        const userId = await userKv.get(doc.user.toString());
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
        const userId = await userKv.get(doc.user.toString());
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
        const orgId = await orgKv.get(doc.organization.toString());
        // expired tokens can be removed
        // cannot use this uuid for the org id
        return {
          id: doc._id.toString(),
          name: doc.name,
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

    const getEnvId = (workspace: string, environment: string) => {
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
        // to we scope environments into each project then map each slug with respective id
        const envKv = envPKv.sublevel(doc._id.toString());
        // expired tokens can be removed
        // cannot use this uuid for the org id
        return doc.environments.map((env, index) => {
          const id = uuidV4();
          envKv.put(env.slug, id);
          return {
            id,
            name: env.name,
            slug: env.slug,
            position: index + 1,
            projectId: doc._id.toString(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });
      },
    });

    console.log("Creating root folders for all environments");
    await migrateCollection({
      db,
      mongooseCollection: Workspace,
      postgresTableName: TableName.SecretFolder,
      returnKeys: ["id"],
      preProcessing: async (doc) =>
        Promise.all(
          doc.environments.map(async (env) => {
            const id = uuidV4();
            const envId = await getEnvId(doc._id.toString(), env.slug);
            const folderKv = getFolderKv(doc._id.toString(), env.slug);
            await folderKv.put("root", id);
            return {
              id,
              name: "root",
              envId,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }),
        ),
    });

    await migrateCollection({
      db,
      mongooseCollection: Key,
      postgresTableName: TableName.ProjectKeys,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        // expired tokens can be removed
        // cannot use this uuid for the org id
        const id = uuidV4();
        const senderId = (await userKv.get(doc.sender.toString())) || null;
        const receiverId = await userKv.get(doc.receiver.toString());
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
        await projectRoleKv.put(doc._id.toString(), id);
        return {
          id,
          name: doc.name,
          projectId: doc.workspace.toString(),
          description: doc.description,
          slug: doc.slug,
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
        const userId = await userKv.get(doc.user.toString());
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
        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
        const folders = flattenFolders(doc.nodes);

        const pgFolder = await Promise.all(
          folders
            // already has been created
            .filter(({ id }) => id !== "root")
            .map(async (folder) => {
              const { name, version } = folder;
              const id = uuidV4();
              await folderKv.put(folder.id, id);
              const parentId = folder.parentId
                ? await folderKv.get(folder.parentId)
                : null;
              return {
                name,
                version,
                id,
                parentId,
                envId,
                createdAt: (doc as any).createdAt,
                updatedAt: (doc as any).updatedAt,
              };
            }),
        );

        return pgFolder;
      },
    });

    await migrateCollection({
      db,
      mongooseCollection: FolderVersion,
      postgresTableName: TableName.SecretFolderVersion,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
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
            const folderId = await folderKv.get(folder.id);
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

    await migrateCollection({
      db,
      mongooseCollection: SecretImport,
      postgresTableName: TableName.SecretImport,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const envKv = envPKv.sublevel(doc.workspace.toString());
        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);
        const folderId = await folderKv.get(doc.folderId);

        return Promise.all(
          doc.imports.map(async ({ environment, secretPath }, index) => {
            const id = uuidV4();
            const importEnv = await envKv.get(environment);
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
          }),
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
        const createdBy = await userKv.get(doc.user.toString());

        return {
          id,
          name: doc.name,
          slug: doc.slug,
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
        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);
        const folderId = await folderKv.get(doc.folder || "root");

        const userId = doc.user ? await userKv.get(doc.user.toString()) : null;
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
            const secretId = await secKv.get(doc._id.toString());
            const secretTagId = await tagKv.get(tagId);
            return {
              id,
              [`${TableName.Secret}Id`]: secretId,
              [`${TableName.SecretTag}Id`]: secretTagId,
              createdAt: new Date((doc as any).createdAt),
              updatedAt: new Date((doc as any).updatedAt),
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
        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);

        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
        const folderId = await folderKv.get(doc.folder || "root");
        const userId = doc.user ? await userKv.get(doc.user.toString()) : null;

        const id = uuidV4();
        await secVerKv.put(doc._id.toString(), id);
        const secretId = await secKv.get(doc.secret.toString());
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
        await projectBotKv.put(doc._id.toString(), id);
        const botKey = await BotKey.findOne({
          workspace: doc.workspace,
        }).lean();
        const senderId = botKey?.sender
          ? await userKv.get(botKey.sender.toString())
          : null;
        return {
          id,
          algorithm: doc.algorithm,
          keyEncoding: doc.keyEncoding,
          projectId: doc.workspace.toString(),
          name: doc.name,
          iv: doc.iv,
          tag: doc.tag,
          senderId,
          isActive: doc.isActive,
          publicKey: doc.publicKey,
          encryptedProjectKey: botKey?.encryptedKey || null,
          encryptedProjectKeyNonce: botKey?.nonce || null,
          encryptedPrivateKey: doc.encryptedPrivateKey,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
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

    await migrateCollection({
      db,
      mongooseCollection: Integration,
      postgresTableName: TableName.Integration,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
        const integrationAuthId = await integrationAuthKv.get(
          doc.integrationAuth.toString(),
        );

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
        const id = uuidV4();
        const userId = await userKv.get(doc.user.toString());
        return {
          id,
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

    await migrateCollection({
      db,
      mongooseCollection: Webhook,
      postgresTableName: TableName.Webhook,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
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
        const id = uuidV4();
        const identityUAId = await identityUaKv.get(
          doc.identityUniversalAuth.toString(),
        );
        await identityUaClientSecKv.put(doc._id.toString(), id);
        return {
          id,
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

    await migrateCollection({
      db,
      mongooseCollection: IdentityAccessToken,
      postgresTableName: TableName.IdentityAccessToken,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
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
        const orgId = await orgKv.get(doc.organization.toString());
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
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
        sapKv.put(doc._id.toString(), id);

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
      postgresTableName: TableName.SapApprover,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const policyId = await sapKv.get(doc._id.toString());

        return Promise.all(
          doc.approvers.map(async (membId) => {
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
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);

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

    await migrateCollection({
      db,
      mongooseCollection: SSOConfig,
      postgresTableName: TableName.SamlConfig,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const orgId = await orgKv.get(doc.organization.toString());

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

    await migrateCollection({
      db,
      mongooseCollection: BotOrg,
      postgresTableName: TableName.OrgBot,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const orgId = await orgKv.get(doc.organization.toString());

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
        const orgId = await orgKv.get(doc.organization.toString());
        const userId = await userKv.get(doc.user.toString());

        return {
          id,
          orgId,
          userId,
          sessionId: doc.sessionId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
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
        const orgId = await orgKv.get(doc.organizationId);
        const userId = await userKv.get(doc.user.toString());

        return {
          id,
          orgId,
          userId,
          installationId: doc.installationId,
          createdAt: new Date((doc as any).createdAt),
          updatedAt: new Date((doc as any).updatedAt),
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
        const orgId = await orgKv.get(doc.organization.toString());

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
          pusherName: doc.pusher.name,
          description: doc.description,
          fingerprint: doc.fingerprint,
          fingerPrintWithoutCommitId: doc.fingerPrintWithoutCommitId,
          pusherEmail: doc.pusher.email,
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

    await migrateCollection({
      db,
      mongooseCollection: TrustedIP,
      postgresTableName: TableName.TrustedIps,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();

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
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);
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
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);

        return Promise.all(
          doc.secretVersions.map(async (secVer) => {
            const id = uuidV4();
            const secretVersionId = await secVerKv.get(secVer.toString());
            return {
              id,
              envId,
              snapshotId,
              secretVersionId,
              createdAt: (doc as any).createdAt,
              updatedAt: (doc as any).updatedAt,
            };
          }),
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
        const envId = await getEnvId(doc.workspace.toString(), doc.environment);
        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);
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
        await sarKv.put(doc._id.toString(), id);
        const policyId = await sapKv.get(doc.policy.toString());

        const folderKv = getFolderKv(doc.workspace.toString(), doc.environment);
        const folderId = await folderKv.get(doc.folderId);

        const committerId = await projectMembKv.get(doc.committer.toString());
        const statusChangeBy = doc.statusChangeBy
          ? await projectMembKv.get(doc.statusChangeBy.toString())
          : null;
        return {
          id,
          policyId,
          hasMerged: doc.hasMerged,
          status: doc.status,
          conflicts: JSON.stringify(doc.conflicts),
          slug: doc.slug,
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
      postgresTableName: TableName.SarReviewer,
      returnKeys: ["id"],
      preProcessing: async (doc) => {
        const id = uuidV4();
        const requestId = await sarKv.get(doc._id.toString());

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

    process.exit(1);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

main();
