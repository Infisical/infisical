/* eslint-disable no-console */
import crypto from "crypto";
import { Types } from "mongoose";
import { encryptSymmetric128BitHexKeyUTF8 } from "../crypto";
import { EESecretService } from "../../ee/services";
import { 
  IPType, 
  ISecretVersion, 
  SecretSnapshot,
  SecretVersion,
  TrustedIP
} from "../../ee/models";
import {
  BackupPrivateKey,
  Bot,
  BotOrg,
  ISecret,
  Integration,
  IntegrationAuth,
  Organization,
  Secret,
  SecretBlindIndexData,
  ServiceTokenData,
  Workspace
} from "../../models";
import { generateKeyPair } from "../../utils/crypto";
import { client, getEncryptionKey, getRootEncryptionKey } from "../../config";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8
} from "../../variables";
import { InternalServerError } from "../errors";

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
  console.log("Migration: Secret version migration v1 complete");
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
      await secSnapshot.delete();
    }

    secretSnapshots = await SecretSnapshot.find({
      environment: {
        $exists: false
      }
    })
      .populate<{ secretVersions: ISecretVersion[] }>("secretVersions")
      .limit(50);
  }

  console.log("Migration: Folder migration v1 complete");
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
  console.log("Migration: Service token migration v1 complete");
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
  console.log("Migration: Integration migration v1 complete");
};

export const backfillServiceTokenMultiScope = async () => {
  await ServiceTokenData.updateMany(
    {
      scopes: {
        $exists: false
      }
    },
    [
      {
        $set: {
          scopes: [{ environment: "$environment", secretPath: "$secretPath" }]
        }
      }
    ]
  );

  console.log("Migration: Service token migration v2 complete");
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
        },
        update: {
          workspace: Types.ObjectId;
          ipAddress: string;
          type: string;
          prefix: number;
          isActive: boolean;
          comment: string;
        },
        upsert: boolean;
      }
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
    console.log("Backfill: Trusted IPs complete");
  }
}
