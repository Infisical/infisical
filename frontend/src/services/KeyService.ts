import {
    decryptAssymmetric,
    encryptAssymmetric} from "@app/components/utilities/cryptography/crypto";
import { 
    decryptPrivateKeyHelper
} from "@app/helpers/key";

/**
 * Class to handle key actions
 * TODO: in future, all private key-related encryption operations 
 * must pass through this class
 */
class KeyService {
    private static privateKey: string = "";
    
    static setPrivateKey(privateKey: string) {
        KeyService.privateKey = privateKey;
    }

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
    
    /**
     * Return [plaintext] encrypted by the user's private key
     * @param {Object} obj
     * @param {String} obj.plaintext - plaintext to encrypt
     */
    static encryptWithPrivateKey({
        plaintext,
        publicKey,
    }: {
        plaintext: string;
        publicKey: string;
    }) {
        return encryptAssymmetric({
            plaintext,
            publicKey,
            privateKey: KeyService.privateKey
        });
    }
    
    /**
     * Return [ciphertext] decrypted by the user's private key
     * @param {Object} obj
     * @param {String} obj.ciphertext - ciphertext to decrypt
     * @param {String} obj.ciphertext - iv of ciphertext
     * @param {String} obj.ciphertext - tag of ciphertext
     */
    static decryptWithPrivateKey({
        ciphertext,
        nonce,
        publicKey
    }: {
        ciphertext: string;
        nonce: string;
        publicKey: string;
    }) {
        return decryptAssymmetric({
            ciphertext,
            nonce,
            publicKey,
            privateKey: KeyService.privateKey
        });
    }
}

export default KeyService;