import { Types } from "mongoose";
import { client, getEncryptionKey, getRootEncryptionKey } from "../config";
import { BotOrg } from "../models";
import { decryptSymmetric128BitHexKeyUTF8 } from "../utils/crypto";
import {
    ENCODING_SCHEME_BASE64,
    ENCODING_SCHEME_UTF8
} from "../variables";
import { InternalServerError } from "../utils/errors";

// TODO: DOCstrings

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