import { Types } from "mongoose";
import { client, getEncryptionKey, getRootEncryptionKey } from "../config";
import { BotOrg } from "../models";
import { decryptSymmetric128BitHexKeyUTF8 } from "../utils/crypto";
import {
    ALGORITHM_AES_256_GCM,
    ENCODING_SCHEME_BASE64,
    ENCODING_SCHEME_UTF8
} from "../variables";
import { InternalServerError } from "../utils/errors";
import { encryptSymmetric128BitHexKeyUTF8, generateKeyPair } from "../utils/crypto";

/**
 * Create a bot with name [name] for organization with id [organizationId]
 * @param {Object} obj
 * @param {String} obj.name - name of bot
 * @param {String} obj.organizationId - id of organization that bot belongs to
 */
export const createBotOrg = async ({
  name,
  organizationId,
}: {
  name: string;
  organizationId: Types.ObjectId;
}) => {
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();

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

        return await new BotOrg({
            name,
            organization: organizationId,
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
        }).save();
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

        return await new BotOrg({
            name,
            organization: organizationId,
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
        }).save();
    }

  throw InternalServerError({
    message: "Failed to create new organization bot due to missing encryption key",
  });
};

export const getSymmetricKeyHelper = async (organizationId: Types.ObjectId) => {
    const rootEncryptionKey = await getRootEncryptionKey();
    const encryptionKey = await getEncryptionKey();

    const botOrg = await BotOrg.findOne({
        organization: organizationId
    });
    
    if (!botOrg) throw new Error("Failed to find organization bot");

    if (rootEncryptionKey && botOrg.symmetricKeyKeyEncoding == ENCODING_SCHEME_BASE64) {
        const key = client.decryptSymmetric(
            botOrg.encryptedSymmetricKey, 
            rootEncryptionKey, 
            botOrg.symmetricKeyIV, 
            botOrg.symmetricKeyTag
        );

        return key;
    } else if (encryptionKey && botOrg.symmetricKeyKeyEncoding === ENCODING_SCHEME_UTF8) {
       const key = decryptSymmetric128BitHexKeyUTF8({
            ciphertext: botOrg.encryptedSymmetricKey,
            iv: botOrg.symmetricKeyIV,
            tag: botOrg.symmetricKeyTag,
            key: encryptionKey
        });
        
        return key;
    }

    throw InternalServerError({
        message: "Failed to match encryption key with organization bot symmetric key encoding"
    });
}