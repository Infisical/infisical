import {
    Bot,
    BotOrg,
    IBot,
    IBotOrg,
    ISecretBlindIndexData,
    SecretBlindIndexData,
} from "../../models";
import { decryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";
import { 
    client,
    getEncryptionKey, 
    getRootEncryptionKey, 
} from "../../config";
import {
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_BASE64,
    ENCODING_SCHEME_UTF8,
} from "../../variables";

/**
 * Re-encrypt bot private keys from under hex 128-bit ENCRYPTION_KEY
 * to base64 256-bit ROOT_ENCRYPTION_KEY
 */
export const reencryptBotPrivateKeys = async () => {
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();

    if (encryptionKey && rootEncryptionKey) {
        // 1: re-encrypt bot private keys under ROOT_ENCRYPTION_KEY
        const bots = await Bot.find({
            algorithm: ALGORITHM_AES_256_GCM,
            keyEncoding: ENCODING_SCHEME_UTF8,
        }).select("+encryptedPrivateKey iv tag algorithm keyEncoding");
        
        if (bots.length === 0) return;
        
        const operationsBot = await Promise.all(
            bots.map(async (bot: IBot) => {
                
                const privateKey = decryptSymmetric128BitHexKeyUTF8({
                    ciphertext: bot.encryptedPrivateKey,
                    iv: bot.iv,
                    tag: bot.tag,
                    key: encryptionKey,
                });

                const {
                    ciphertext: encryptedPrivateKey,
                    iv,
                    tag,
                } = client.encryptSymmetric(privateKey, rootEncryptionKey);
                
                return ({
                    updateOne: {
                        filter: {
                            _id: bot._id,
                        },
                        update: {
                            encryptedPrivateKey,
                            iv,
                            tag,
                            algorithm: ALGORITHM_AES_256_GCM,
                            keyEncoding: ENCODING_SCHEME_BASE64,
                        },
                    },
                })
            })
        );
        
        await Bot.bulkWrite(operationsBot);
    }
}

/**
 * Re-encrypt organization bot keys (symmetric and private) from under hex 128-bit ENCRYPTION_KEY
 * to base64 256-bit ROOT_ENCRYPTION_KEY
 */
export const reencryptBotOrgKeys = async () => {
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();

    if (encryptionKey && rootEncryptionKey) {
        // 1: re-encrypt organization bot keys under ROOT_ENCRYPTION_KEY
        const botOrgs = await BotOrg.find({
            symmetricKeyAlgorithm: ALGORITHM_AES_256_GCM,
            symmetricKeyKeyEncoding: ENCODING_SCHEME_UTF8,
            privateKeyAlgorithm: ALGORITHM_AES_256_GCM,
            privateKeyKeyEncoding: ENCODING_SCHEME_UTF8
        }).select("+encryptedPrivateKey iv tag algorithm keyEncoding");
        
        if (botOrgs.length === 0) return;
        
        const operationsBotOrg = await Promise.all(
            botOrgs.map(async (botOrg: IBotOrg) => {
                const privateKey = decryptSymmetric128BitHexKeyUTF8({
                    ciphertext: botOrg.encryptedPrivateKey,
                    iv: botOrg.privateKeyIV,
                    tag: botOrg.privateKeyTag,
                    key: encryptionKey
                });

                const {
                    ciphertext: encryptedPrivateKey,
                    iv: privateKeyIV,
                    tag: privateKeyTag,
                } = client.encryptSymmetric(privateKey, rootEncryptionKey);
                
                const symmetricKey = decryptSymmetric128BitHexKeyUTF8({
                    ciphertext: botOrg.encryptedSymmetricKey,
                    iv: botOrg.symmetricKeyIV,
                    tag: botOrg.symmetricKeyTag,
                    key: encryptionKey
                });

                const {
                    ciphertext: encryptedSymmetricKey,
                    iv: symmetricKeyIV,
                    tag: symmetricKeyTag,
                } = client.encryptSymmetric(symmetricKey, rootEncryptionKey);
                
                return ({
                    updateOne: {
                        filter: {
                            _id: botOrg._id,
                        },
                        update: {
                            encryptedSymmetricKey,
                            symmetricKeyIV,
                            symmetricKeyTag,
                            symmetricKeyAlgorithm: ALGORITHM_AES_256_GCM,
                            symmetricKeyKeyEncoding: ENCODING_SCHEME_BASE64,
                            encryptedPrivateKey,
                            privateKeyIV,
                            privateKeyTag,
                            privateKeyAlgorithm: ALGORITHM_AES_256_GCM,
                            privateKeyKeyEncoding: ENCODING_SCHEME_BASE64,
                        },
                    },
                })
            })
        );
        
        await BotOrg.bulkWrite(operationsBotOrg);
    }
}

/**
 * Re-encrypt secret blind index data salts from hex 128-bit ENCRYPTION_KEY
 * to base64 256-bit ROOT_ENCRYPTION_KEY
 */
export const reencryptSecretBlindIndexDataSalts = async () => {
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();

    if (encryptionKey && rootEncryptionKey) {
        const secretBlindIndexData = await SecretBlindIndexData.find({
            algorithm: ALGORITHM_AES_256_GCM,
            keyEncoding: ENCODING_SCHEME_UTF8,
        }).select("+encryptedSaltCiphertext +saltIV +saltTag +algorithm +keyEncoding");
        
        if (secretBlindIndexData.length == 0) return;
        
        const operationsSecretBlindIndexData = await Promise.all(
            secretBlindIndexData.map(async (secretBlindIndexDatum: ISecretBlindIndexData) => {

                const salt = decryptSymmetric128BitHexKeyUTF8({
                    ciphertext: secretBlindIndexDatum.encryptedSaltCiphertext,
                    iv: secretBlindIndexDatum.saltIV,
                    tag: secretBlindIndexDatum.saltTag,
                    key: encryptionKey,
                });
                
                const {
                    ciphertext: encryptedSaltCiphertext,
                    iv: saltIV,
                    tag: saltTag,
                } = client.encryptSymmetric(salt, rootEncryptionKey);

                return ({
                    updateOne: {
                        filter: {
                            _id: secretBlindIndexDatum._id,
                        },
                        update: {
                            encryptedSaltCiphertext,
                            saltIV,
                            saltTag,
                            algorithm: ALGORITHM_AES_256_GCM,
                            keyEncoding: ENCODING_SCHEME_BASE64,
                        },
                    },
                })
            })
        );
            
        await SecretBlindIndexData.bulkWrite(operationsSecretBlindIndexData);
    }
}