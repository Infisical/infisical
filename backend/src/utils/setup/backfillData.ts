import crypto from 'crypto';
import { encryptSymmetric128BitHexKeyUTF8 } from '../crypto';
import { EESecretService } from '../../ee/services';
import { SecretVersion } from '../../ee/models';
import {
    Secret,
    ISecret,
    SecretBlindIndexData,
    Workspace,
    Bot,
    BackupPrivateKey,
    IntegrationAuth,
} from '../../models';
import {
    generateKeyPair
} from '../../utils/crypto';
import { 
    client,
    getEncryptionKey, 
    getRootEncryptionKey 
} from '../../config';
import { 
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_UTF8,
    ENCODING_SCHEME_BASE64
} from '../../variables';
import { InternalServerError } from '../errors';

/**
 * Backfill secrets to ensure that they're all versioned and have
 * corresponding secret versions
 */
export const backfillSecretVersions = async () => {
    await Secret.updateMany(
        { version: { $exists: false } },
        { $set: { version: 1 } }
    );
    
    const unversionedSecrets: ISecret[] = await Secret.aggregate([
        {
            $lookup: {
                from: "secretversions",
                localField: "_id",
                foreignField: "secret",
                as: "versions",
            },
        },
        {
            $match: {
                versions: { $size: 0 },
            },
        },
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
            ),
        });
    }
}

/**
 * Backfill workspace bots to ensure that every workspace has a bot
 */
export const backfillBots = async () => {
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();

    const workspaceIdsWithBot = await Bot.distinct('workspace');
    const workspaceIdsToAddBot = await Workspace.distinct('_id', {
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
                    name: 'Infisical Bot',
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
                    name: 'Infisical Bot',
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
                message: 'Failed to backfill workspace bots due to missing encryption key'
            });
        })
    );
    
    await Bot.insertMany(botsToInsert);
}

/**
 * Backfill secret blind index data to ensure that every workspace
 * has a secret blind index data
 */
export const backfillSecretBlindIndexData = async () => {

    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();
    
    const workspaceIdsBlindIndexed = await SecretBlindIndexData.distinct('workspace');
    const workspaceIdsToBlindIndex = await Workspace.distinct('_id', {
        _id: {
            $nin: workspaceIdsBlindIndexed
        }
    });

    if (workspaceIdsToBlindIndex.length === 0) return;
    
    const secretBlindIndexDataToInsert = await Promise.all(
        workspaceIdsToBlindIndex.map(async (workspaceToBlindIndex) => {
            const salt = crypto.randomBytes(16).toString('base64');
            
            if (rootEncryptionKey) {
                const { 
                    ciphertext: encryptedSaltCiphertext,
                    iv: saltIV,
                    tag: saltTag
                } = client.encryptSymmetric(salt, rootEncryptionKey)

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
                message: 'Failed to backfill secret blind index data due to missing encryption key'
            });
        })
    );
    
    SecretBlindIndexData.insertMany(secretBlindIndexDataToInsert);
}

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
}