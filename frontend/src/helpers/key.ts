import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";

/**
 * @param {Object} obj
 * @param {Number} obj.encryptionVersion
 * @param {String} obj.encryptedPrivateKey
 * @param {String} obj.iv
 * @param {String} obj.tag
 * @param {String} obj.password
 * @param {String} obj.salt
 * @param {String} obj.protectedKey
 * @param {String} obj.protectedKeyIV
 * @param {String} obj.protectedKeyTag
 */
const decryptPrivateKeyHelper = async ({
    encryptionVersion,
    encryptedPrivateKey,
    iv,
    tag,
    password,
    salt,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
}: {
    encryptionVersion: number;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
    password: string;
    salt: string;
    protectedKey?: string;
    protectedKeyIV?: string;
    protectedKeyTag?: string;
}) => {
let privateKey;
    try {
        if (encryptionVersion === 1) {
            privateKey = Aes256Gcm.decrypt({
                ciphertext: encryptedPrivateKey,
                iv,
                tag,
                secret: password
                .slice(0, 32)
                .padStart(32 + (password.slice(0, 32).length - new Blob([password]).size), "0")
            });
        } else if (encryptionVersion === 2 && protectedKey && protectedKeyIV && protectedKeyTag) {
            const derivedKey = await deriveArgonKey({
                password,
                salt,
                mem: 65536,
                time: 3,
                parallelism: 1,
                hashLen: 32
            });
            
            if (!derivedKey) throw new Error("Failed to generate derived key");

            const key = Aes256Gcm.decrypt({
                ciphertext: protectedKey,
                iv: protectedKeyIV,
                tag: protectedKeyTag,
                secret: Buffer.from(derivedKey.hash)
            });
            
            // decrypt back the private key
            privateKey = Aes256Gcm.decrypt({
                ciphertext: encryptedPrivateKey,
                iv,
                tag,
                secret: Buffer.from(key, "hex")
            });
        } else {
            throw new Error("Insufficient details to decrypt private key");
        }
    } catch (err) {
        throw new Error("Failed to decrypt private key");
    }

    return privateKey;
}

export {
    decryptPrivateKeyHelper
};