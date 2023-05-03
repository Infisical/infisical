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
    IntegrationAuth
} from '../../models';
import { getEncryptionKey, getRootEncryptionKey } from '../../config';
import { 
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_UTF8
} from '../../variables';

/**
 * 
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
                })
            ),
        });
    }
}

export const backfillSecretBlindIndexData = async () => {
    const workspaceIdsBlindIndexed = await SecretBlindIndexData.distinct('workspace');
    const workspaceIdsToBlindIndex = await Workspace.distinct('_id', {
        _id: {
            $nin: workspaceIdsBlindIndexed
        }
    });
    
    const secretBlindIndexDataToInsert = await Promise.all(
        workspaceIdsToBlindIndex.map(async (workspaceToBlindIndex) => {
            const salt = crypto.randomBytes(16).toString('base64');

            const { 
                ciphertext: encryptedSaltCiphertext,
                iv: saltIV,
                tag: saltTag
            } = encryptSymmetric128BitHexKeyUTF8({
                plaintext: salt,
                key: await getEncryptionKey()
            });

            const secretBlindIndexData = new SecretBlindIndexData({
                workspace: workspaceToBlindIndex,
                encryptedSaltCiphertext,
                saltIV,
                saltTag
            })
            
            return secretBlindIndexData;
        })
    );
    
    if (secretBlindIndexDataToInsert.length > 0) {
        await SecretBlindIndexData.insertMany(secretBlindIndexDataToInsert);
    }
}

export const backfillEncryptionMetadata = async () => {

    // backfill bot encryption metadata
    await Bot.updateMany(
        {
            algorithm: {
                $exists: false
            },
            keySize: {
                $exists: false
            },
            keyEncoding: {
                $exists: false
            }
        },
        {
            $set: {
                algorithm: ALGORITHM_AES_256_GCM,
                keySize: 256,
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
            keySize: {
                $exists: false
            },
            keyEncoding: {
                $exists: false
            }
        },
        {
            $set: {
                algorithm: ALGORITHM_AES_256_GCM,
                keySize: 256,
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
            keySize: {
                $exists: false
            },
            keyEncoding: {
                $exists: false
            }
        },
        {
            $set: {
                algorithm: ALGORITHM_AES_256_GCM,
                keySize: 256,
                keyEncoding: ENCODING_SCHEME_UTF8
            }
        }
    );

    // backfill integration auth encryption metadata
    await IntegrationAuth.updateMany(
        {
            
        },
        {
            $set: {
                algorithm: ALGORITHM_AES_256_GCM,

            }
        }
    );
    
    // TODO: blind indices
    // TODO: secret versions and snapshots etc.
    
    // TODO: re-encrypt keys logic
    // TODO: how do you handle different parts of the software
    // encrypting under different schemes?
    
    // const encryptionKey = await getEncryptionKey();
    // const rootEncryptionKey = await getRootEncryptionKey();
    //     console.log('rootEncryptionKey: ', rootEncryptionKey);
    
    // if (encryptionKey && rootEncryptionKey) {
    //     // case: both the old encryption key and new encryption key are present
    //     // -> perform migration if needed
    //     console.log('rootEncryptionKey is defined');
        
    //     const bots = await Bot.find({
    //     algorithm: ALGORITHM_AES_256_GCM,
    //     keySize: 256,
    //     keyEncoding: ENCODING_SCHEME_UTF8
    //     }, 'encryptedPrivateKey iv tag');
        
    //     if (bots.length > 0) {
    //     // TODO: unencrypt and re-encrypt
    //     // TODO: unencrypt and re-encrypt blind-indices
    //     // probably then need to move this function
        
    //     console.log('bots: ', bots);
    //     }
    // }
}
