import { decryptPrivateKeyHelper } from '@app/helpers/key';

/**
 * Class to handle key actions
 */
class KeyService {

    /** Return the user's decrypted private key
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
     * @returns {String} privateKey - decrypted private key
     */
    static async decryptPrivateKey({
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
    }) {
        return decryptPrivateKeyHelper({
            encryptionVersion,
            encryptedPrivateKey,
            iv,
            tag,
            password,
            salt,
            protectedKey,
            protectedKeyIV,
            protectedKeyTag
        });
    }
}

export default KeyService;