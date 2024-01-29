import crypto from "crypto";
import { Types } from "mongoose";
import { encryptSymmetric128BitHexKeyUTF8 } from "../crypto";
import { EESecretService } from "../../ee/services";
import { redisClient } from "../../services/RedisService";
import {
  IPType,
  ISecretVersion,
  Role,
  SecretSnapshot,
  SecretVersion,
  TrustedIP
} from "../../ee/models";
import {
  AuthMethod,
  BackupPrivateKey,
  Bot,
  BotOrg,
  ISecret,
  IWorkspace,
  Integration,
  IntegrationAuth,
  Membership,
  MembershipOrg,
  Organization,
  Secret,
  SecretBlindIndexData,
  ServiceTokenData,
  User,
  Workspace
} from "../../models";
import { generateKeyPair } from "../../utils/crypto";
import { client, getEncryptionKey, getIsInfisicalCloud, getRootEncryptionKey } from "../../config";
import {
  ADMIN,
  ALGORITHM_AES_256_GCM,
  CUSTOM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8,
  MEMBER,
  OWNER
} from "../../variables";
import { InternalServerError } from "../errors";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  memberProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { logger } from "../logging";
import { getServerConfig, updateServerConfig } from "../../config/serverConfig";

/**
 * Backfill secrets to ensure that they're all versioned and have
 * corresponding secret versions
 */
export const backfillSecretVersions = async () => {
  await Secret.updateMany({ version: { $exists: false } }, { $set: { version: 1 } });

  const unversionedSecrets: ISecret[] = await Secret.aggregate([
    {
      $lookup: {
        from: "secretversions",
        localField: "_id",
        foreignField: "secret",
        as: "versions"
      }
    },
    {
      $match: {
        versions: { $size: 0 }
      }
    }
  ]);

  if (unversionedSecrets.length > 0) {
    await EESecretService.addSecretVersions({
      secretVersions: unversionedSecrets.map(
        (s, idx) =>
          new SecretVersion({
            ...s,
            secret: s._id,
            version: s.version ? s.version : 1,
            isDeleted: false,
            workspace: s.workspace,
            environment: s.environment,
            algorithm: ALGORITHM_AES_256_GCM,
            keyEncoding: ENCODING_SCHEME_UTF8
          })
      )
    });
  }
  logger.info("Migration: Secret version migration v1 complete");
};

/**
 * Backfill workspace bots to ensure that every workspace has a bot
 */
export const backfillBots = async () => {
  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  const workspaceIdsWithBot = await Bot.distinct("workspace");
  const workspaceIdsToAddBot = await Workspace.distinct("_id", {
    _id: {
      $nin: workspaceIdsWithBot
    }
  });

  if (workspaceIdsToAddBot.length === 0) return;

  const botsToInsert = await Promise.all(
    workspaceIdsToAddBot.map(async (workspaceToAddBot) => {
      const { publicKey, privateKey } = generateKeyPair();

      if (rootEncryptionKey) {
        const {
          ciphertext: encryptedPrivateKey,
          iv,
          tag
        } = client.encryptSymmetric(privateKey, rootEncryptionKey);

        return new Bot({
          name: "Infisical Bot",
          workspace: workspaceToAddBot,
          isActive: false,
          publicKey,
          encryptedPrivateKey,
          iv,
          tag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_BASE64
        });
      } else if (encryptionKey) {
        const {
          ciphertext: encryptedPrivateKey,
          iv,
          tag
        } = encryptSymmetric128BitHexKeyUTF8({
          plaintext: privateKey,
          key: encryptionKey
        });

        return new Bot({
          name: "Infisical Bot",
          workspace: workspaceToAddBot,
          isActive: false,
          publicKey,
          encryptedPrivateKey,
          iv,
          tag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8
        });
      }

      throw InternalServerError({
        message: "Failed to backfill workspace bots due to missing encryption key"
      });
    })
  );

  await Bot.insertMany(botsToInsert);
};

/**
 * Backfill organization bots to ensure that every organization has a bot
 */
export const backfillBotOrgs = async () => {
  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  const organizationIdsWithBot = await BotOrg.distinct("organization");
  const organizationIdsToAddBot = await Organization.distinct("_id", {
    _id: {
      $nin: organizationIdsWithBot
    }
  });

  if (organizationIdsToAddBot.length === 0) return;

  const botsToInsert = await Promise.all(
    organizationIdsToAddBot.map(async (organizationToAddBot) => {
      const { publicKey, privateKey } = generateKeyPair();

      const key = client.createSymmetricKey();

      if (rootEncryptionKey) {
        const {
          ciphertext: encryptedPrivateKey,
          iv: privateKeyIV,
          tag: privateKeyTag
        } = client.encryptSymmetric(privateKey, rootEncryptionKey);

        const {
          ciphertext: encryptedSymmetricKey,
          iv: symmetricKeyIV,
          tag: symmetricKeyTag
        } = client.encryptSymmetric(key, rootEncryptionKey);

        return new BotOrg({
          name: "Infisical Bot",
          organization: organizationToAddBot,
          publicKey,
          encryptedSymmetricKey,
          symmetricKeyIV,
          symmetricKeyTag,
          symmetricKeyAlgorithm: ALGORITHM_AES_256_GCM,
          symmetricKeyKeyEncoding: ENCODING_SCHEME_BASE64,
          encryptedPrivateKey,
          privateKeyIV,
          privateKeyTag,
          privateKeyAlgorithm: ALGORITHM_AES_256_GCM,
          privateKeyKeyEncoding: ENCODING_SCHEME_BASE64
        });
      } else if (encryptionKey) {
        const {
          ciphertext: encryptedPrivateKey,
          iv: privateKeyIV,
          tag: privateKeyTag
        } = encryptSymmetric128BitHexKeyUTF8({
          plaintext: privateKey,
          key: encryptionKey
        });

        const {
          ciphertext: encryptedSymmetricKey,
          iv: symmetricKeyIV,
          tag: symmetricKeyTag
        } = encryptSymmetric128BitHexKeyUTF8({
          plaintext: key,
          key: encryptionKey
        });

        return new BotOrg({
          name: "Infisical Bot",
          organization: organizationToAddBot,
          publicKey,
          encryptedSymmetricKey,
          symmetricKeyIV,
          symmetricKeyTag,
          symmetricKeyAlgorithm: ALGORITHM_AES_256_GCM,
          symmetricKeyKeyEncoding: ENCODING_SCHEME_UTF8,
          encryptedPrivateKey,
          privateKeyIV,
          privateKeyTag,
          privateKeyAlgorithm: ALGORITHM_AES_256_GCM,
          privateKeyKeyEncoding: ENCODING_SCHEME_UTF8
        });
      }

      throw InternalServerError({
        message: "Failed to backfill organization bots due to missing encryption key"
      });
    })
  );

  await BotOrg.insertMany(botsToInsert);
};

/**
 * Backfill secret blind index data to ensure that every workspace
 * has a secret blind index data
 */
export const backfillSecretBlindIndexData = async () => {
  const encryptionKey = await getEncryptionKey();
  const rootEncryptionKey = await getRootEncryptionKey();

  const workspaceIdsBlindIndexed = await SecretBlindIndexData.distinct("workspace");
  const workspaceIdsToBlindIndex = await Workspace.distinct("_id", {
    _id: {
      $nin: workspaceIdsBlindIndexed
    }
  });

  if (workspaceIdsToBlindIndex.length === 0) return;

  const secretBlindIndexDataToInsert = await Promise.all(
    workspaceIdsToBlindIndex.map(async (workspaceToBlindIndex) => {
      const salt = crypto.randomBytes(16).toString("base64");

      if (rootEncryptionKey) {
        const {
          ciphertext: encryptedSaltCiphertext,
          iv: saltIV,
          tag: saltTag
        } = client.encryptSymmetric(salt, rootEncryptionKey);

        return new SecretBlindIndexData({
          workspace: workspaceToBlindIndex,
          encryptedSaltCiphertext,
          saltIV,
          saltTag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_BASE64
        });
      } else if (encryptionKey) {
        const {
          ciphertext: encryptedSaltCiphertext,
          iv: saltIV,
          tag: saltTag
        } = encryptSymmetric128BitHexKeyUTF8({
          plaintext: salt,
          key: encryptionKey
        });

        return new SecretBlindIndexData({
          workspace: workspaceToBlindIndex,
          encryptedSaltCiphertext,
          saltIV,
          saltTag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8
        });
      }

      throw InternalServerError({
        message: "Failed to backfill secret blind index data due to missing encryption key"
      });
    })
  );

  SecretBlindIndexData.insertMany(secretBlindIndexDataToInsert);
};

/**
 * Backfill Secret, SecretVersion, SecretBlindIndexData, Bot,
 * BackupPrivateKey, IntegrationAuth collections to ensure that
 * they all have encryption metadata documented
 */
export const backfillEncryptionMetadata = async () => {
  // backfill secret encryption metadata
  await Secret.updateMany(
    {
      algorithm: {
        $exists: false
      },
      keyEncoding: {
        $exists: false
      }
    },
    {
      $set: {
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8
      }
    }
  );

  // backfill secret version encryption metadata
  await SecretVersion.updateMany(
    {
      algorithm: {
        $exists: false
      },
      keyEncoding: {
        $exists: false
      }
    },
    {
      $set: {
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8
      }
    }
  );

  // backfill secret blind index encryption metadata
  await SecretBlindIndexData.updateMany(
    {
      algorithm: {
        $exists: false
      },
      keyEncoding: {
        $exists: false
      }
    },
    {
      $set: {
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8
      }
    }
  );

  // backfill bot encryption metadata
  await Bot.updateMany(
    {
      algorithm: {
        $exists: false
      },
      keyEncoding: {
        $exists: false
      }
    },
    {
      $set: {
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8
      }
    }
  );

  // backfill backup private key encryption metadata
  await BackupPrivateKey.updateMany(
    {
      algorithm: {
        $exists: false
      },
      keyEncoding: {
        $exists: false
      }
    },
    {
      $set: {
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8
      }
    }
  );

  // backfill integration auth encryption metadata
  await IntegrationAuth.updateMany(
    {
      algorithm: {
        $exists: false
      },
      keyEncoding: {
        $exists: false
      }
    },
    {
      $set: {
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8
      }
    }
  );
};

export const backfillSecretFolders = async () => {
  await Secret.updateMany(
    {
      folder: {
        $exists: false
      }
    },
    {
      $set: {
        folder: "root"
      }
    }
  );

  await SecretVersion.updateMany(
    {
      folder: {
        $exists: false
      }
    },
    {
      $set: {
        folder: "root"
      }
    }
  );

  // Back fill because tags were missing in secret versions
  await SecretVersion.updateMany(
    {
      tags: {
        $exists: false
      }
    },
    {
      $set: {
        tags: []
      }
    }
  );

  let secretSnapshots = await SecretSnapshot.find({
    environment: {
      $exists: false
    }
  })
    .populate<{ secretVersions: ISecretVersion[] }>("secretVersions")
    .limit(50);

  while (secretSnapshots.length > 0) {
    for (const secSnapshot of secretSnapshots) {
      const groupSnapByEnv: Record<string, Array<ISecretVersion>> = {};
      secSnapshot.secretVersions.forEach((secVer) => {
        if (!groupSnapByEnv?.[secVer.environment]) groupSnapByEnv[secVer.environment] = [];
        groupSnapByEnv[secVer.environment].push(secVer);
      });

      const newSnapshots = Object.keys(groupSnapByEnv).map((snapEnv) => {
        const secretIdsOfEnvGroup = groupSnapByEnv[snapEnv]
          ? groupSnapByEnv[snapEnv].map((secretVersion) => secretVersion._id)
          : [];
        return {
          ...secSnapshot.toObject({ virtuals: false }),
          _id: new Types.ObjectId(),
          environment: snapEnv,
          secretVersions: secretIdsOfEnvGroup
        };
      });

      await SecretSnapshot.insertMany(newSnapshots);
      await secSnapshot.deleteOne();
    }

    secretSnapshots = await SecretSnapshot.find({
      environment: {
        $exists: false
      }
    })
      .populate<{ secretVersions: ISecretVersion[] }>("secretVersions")
      .limit(50);
  }

  logger.info("Migration: Folder migration v1 complete");
};

export const backfillServiceToken = async () => {
  await ServiceTokenData.updateMany(
    {
      secretPath: {
        $exists: false
      }
    },
    {
      $set: {
        secretPath: "/"
      }
    }
  );
  logger.info("Migration: Service token migration v1 complete");
};

export const backfillIntegration = async () => {
  await Integration.updateMany(
    {
      secretPath: {
        $exists: false
      }
    },
    {
      $set: {
        secretPath: "/"
      }
    }
  );
  logger.info("Migration: Integration migration v1 complete");
};

export const backfillServiceTokenMultiScope = async () => {
  const documentsToUpdate = await ServiceTokenData.find({ scopes: { $exists: false } });

  for (const doc of documentsToUpdate) {
    // Cast doc to any to bypass TypeScript's type checks
    const anyDoc = doc as any;

    const environment = anyDoc.environment;
    const secretPath = anyDoc.secretPath;

    if (environment && secretPath) {
      const updatedScopes = [
        {
          environment: environment,
          secretPath: secretPath
        }
      ];

      await ServiceTokenData.updateOne({ _id: doc._id }, { $set: { scopes: updatedScopes } });
    }
  }

  logger.info("Migration: Service token migration v2 complete");
};

/**
 * Backfill each workspace without any registered trusted IPs to
 * have default trusted ip of 0.0.0.0/0
 */
export const backfillTrustedIps = async () => {
  const workspaceIdsWithTrustedIps = await TrustedIP.distinct("workspace");
  const workspaceIdsToAddTrustedIp = await Workspace.distinct("_id", {
    _id: {
      $nin: workspaceIdsWithTrustedIps
    }
  });

  if (workspaceIdsToAddTrustedIp.length > 0) {
    const operations: {
      updateOne: {
        filter: {
          workspace: Types.ObjectId;
          ipAddress: string;
        };
        update: {
          workspace: Types.ObjectId;
          ipAddress: string;
          type: string;
          prefix: number;
          isActive: boolean;
          comment: string;
        };
        upsert: boolean;
      };
    }[] = [];

    workspaceIdsToAddTrustedIp.forEach((workspaceId) => {
      // default IPv4 trusted CIDR
      operations.push({
        updateOne: {
          filter: {
            workspace: workspaceId,
            ipAddress: "0.0.0.0"
          },
          update: {
            workspace: workspaceId,
            ipAddress: "0.0.0.0",
            type: IPType.IPV4.toString(),
            prefix: 0,
            isActive: true,
            comment: ""
          },
          upsert: true
        }
      });

      // default IPv6 trusted CIDR
      operations.push({
        updateOne: {
          filter: {
            workspace: workspaceId,
            ipAddress: "::"
          },
          update: {
            workspace: workspaceId,
            ipAddress: "::",
            type: IPType.IPV6.toString(),
            prefix: 0,
            isActive: true,
            comment: ""
          },
          upsert: true
        }
      });
    });

    await TrustedIP.bulkWrite(operations);
    logger.info("Backfill: Trusted IPs complete");
  }
};

export const backfillUserAuthMethods = async () => {
  await User.updateMany(
    {
      authProvider: {
        $exists: false
      },
      authMethods: {
        $exists: false
      }
    },
    {
      authMethods: [AuthMethod.EMAIL]
    }
  );

  const documentsToUpdate = await User.find({
    authProvider: { $exists: true },
    authMethods: { $exists: false }
  });

  for (const doc of documentsToUpdate) {
    // Cast doc to any to bypass TypeScript's type checks
    const anyDoc = doc as any;

    const authProvider = anyDoc.authProvider;
    const authMethods = [authProvider];

    await User.updateOne(
      { _id: doc._id },
      {
        $set: { authMethods: authMethods },
        $unset: { authProvider: 1, authId: 1 }
      }
    );
  }
};

export const backfillPermission = async () => {
  const lockKey = "backfill_permission_lock";
  const timeout = 900000; // 15 min lock timeout in milliseconds
  const lock = await redisClient?.set(lockKey, 1, "PX", timeout, "NX");

  if (lock) {
    try {
      logger.info("Lock acquired for script [backfillPermission]");

      const memberships = await Membership.find({
        deniedPermissions: {
          $exists: true,
          $ne: []
        },
        role: MEMBER
      })
        .populate<{ workspace: IWorkspace }>("workspace")
        .lean();

      // group memberships that need the same permission set
      const roleMap = new Map<
        string,
        { membershipIds: string[]; permissions: any[]; organizationId: string; workspaceId: string }
      >();

      for (const membership of memberships) {
        // get permissions of members except secret permission
        const customPermissions = memberProjectPermissions.rules.filter(
          ({ subject }) => subject !== ProjectPermissionSub.Secrets
        );
        const secretAccessRule: Record<string, { read: boolean; write: boolean }> = {};

        // iterate and record true and false ones
        membership.deniedPermissions.forEach(({ ability, environmentSlug }) => {
          if (!secretAccessRule?.[environmentSlug])
            secretAccessRule[environmentSlug] = { read: true, write: true };
          if (ability === "write") secretAccessRule[environmentSlug].write = false;
          if (ability === "read") secretAccessRule[environmentSlug].read = false;
        });

        // environments that are not listed in deniedPermissions should be set to allowed for both read & and write
        membership.workspace.environments.forEach((env) => {
          if (!secretAccessRule?.[env.slug]) {
            secretAccessRule[env.slug] = { read: true, write: true };
          }
        });

        const secretPermissions: any = [];
        Object.entries(secretAccessRule).forEach(([envSlug, { read, write }]) => {
          if (read) {
            secretPermissions.push({
              subject: ProjectPermissionSub.Secrets,
              action: ProjectPermissionActions.Read,
              conditions: { environment: envSlug }
            });
          }
          if (write) {
            secretPermissions.push(
              {
                subject: ProjectPermissionSub.Secrets,
                action: ProjectPermissionActions.Edit,
                conditions: { environment: envSlug }
              },
              {
                subject: ProjectPermissionSub.Secrets,
                action: ProjectPermissionActions.Delete,
                conditions: { environment: envSlug }
              },
              {
                subject: ProjectPermissionSub.Secrets,
                action: ProjectPermissionActions.Create,
                conditions: { environment: envSlug }
              }
            );
          }
        });

        const key = `${JSON.stringify(secretPermissions)}-${membership.workspace._id.toString()}`; // group roles that have same permission with in the same workspace
        const value = roleMap.get(key);
        if (value) {
          value.membershipIds.push(membership._id.toString());
          value.organizationId = membership.workspace.organization.toString();
          value.workspaceId = membership.workspace._id.toString();
        } else {
          roleMap.set(key, {
            membershipIds: [membership._id.toString()],
            permissions: [...customPermissions, ...secretPermissions],
            organizationId: membership.workspace.organization.toString(),
            workspaceId: membership.workspace._id.toString()
          });
        }
      }

      for (const [key, value] of roleMap.entries()) {
        const { membershipIds, permissions, workspaceId, organizationId } = value;
        const membership_identity = crypto.randomBytes(3).toString("hex");
        const role = new Role({
          name: `Limited [${membership_identity.toUpperCase()}]`,
          organization: organizationId,
          workspace: workspaceId,
          description:
            "This role was auto generated by Infisical in effort to migrate your project members to our new permission system",
          isOrgRole: false,
          slug: `custom-role-${membership_identity}`,
          permissions: permissions
        });

        await role.save();

        for (const id of membershipIds) {
          await Membership.findByIdAndUpdate(id, {
            // document db doesn't support update many so we must loop
            $set: {
              role: CUSTOM,
              customRole: role
            }
          });
        }
      }

      logger.info("Backfill: Finished converting old denied permission in workspace to viewers");

      await MembershipOrg.updateMany(
        {
          role: OWNER
        },
        {
          $set: {
            role: ADMIN
          }
        }
      );

      logger.info("Backfill: Finished converting owner role to member");
    } catch (error) {
      logger.error(error, "An error occurred when running script [backfillPermission]");
    }
  } else {
    logger.info("Could not acquire lock for script [backfillPermission], skipping");
  }
};

export const migrateRoleFromOwnerToAdmin = async () => {
  await MembershipOrg.updateMany(
    {
      role: OWNER
    },
    {
      $set: {
        role: ADMIN
      }
    }
  );

  logger.info("Backfill: Finished converting owner role to member");
};

export const migrationAssignSuperadmin = async () => {
  const users = await User.find({}).sort({ createdAt: 1 }).limit(2);
  const serverCfg = getServerConfig();
  if (serverCfg.initialized) return;

  if (await getIsInfisicalCloud()) {
    await updateServerConfig({ initialized: true });
    logger.info("Backfill: Infisical Cloud(initialized)");
    return;
  }

  if (users.length) {
    let superAdminUserId = "";
    const firstAccount = users?.[0];
    if (firstAccount.email === "test@localhost.local" && users.length === 2) {
      superAdminUserId = users?.[1]?._id.toString();
    } else {
      superAdminUserId = firstAccount._id.toString();
    }

    if (superAdminUserId) {
      const user = await User.findByIdAndUpdate(superAdminUserId, { superAdmin: true });
      await updateServerConfig({ initialized: true });
      logger.info(`Migrated ${user?.email} to superuser`);
    }
    logger.info("Backfill: Migrated first infisical user to super admin");
  }
};
