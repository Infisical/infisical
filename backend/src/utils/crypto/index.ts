import crypto from "crypto";
import nacl from "tweetnacl";
import util from "tweetnacl-util";
import { 
    IDecryptAsymmetricInput,
    IDecryptSymmetricInput,
    IEncryptAsymmetricInput,
    IEncryptAsymmetricOutput,
    IEncryptSymmetricInput,
    IGenerateKeyPairOutput,
} from "../../interfaces/utils";
import { BadRequestError } from "../errors";
import { 
    ALGORITHM_AES_256_GCM,
    BLOCK_SIZE_BYTES_16,
} from "../../variables";

/**
 * Return new base64, NaCl, public-private key pair.
 * @returns {Object} obj
 * @returns {String} obj.publicKey - (base64) NaCl, public key
 * @returns {String} obj.privateKey - (base64), NaCl, private key
 */
const generateKeyPair = (): IGenerateKeyPairOutput => {
	const pair = nacl.box.keyPair();
    
	return ({
		publicKey: util.encodeBase64(pair.publicKey),
		privateKey: util.encodeBase64(pair.secretKey),
	});
}

/**
 * Return assymmetrically encrypted [plaintext] using [publicKey] where
 * [publicKey] likely belongs to the recipient.
 * @param {Object} obj
 * @param {String} obj.plaintext - plaintext to encrypt
 * @param {String} obj.publicKey - (base64) Nacl public key of the recipient
 * @param {String} obj.privateKey - (base64) Nacl private key of the sender (current user)
 * @returns {Object} obj
 * @returns {String} obj.ciphertext - (base64) ciphertext
 * @returns {String} obj.nonce - (base64) nonce
 */
const encryptAsymmetric = ({
	plaintext,
	publicKey,
	privateKey,
}: IEncryptAsymmetricInput): IEncryptAsymmetricOutput => {
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    util.decodeUTF8(plaintext),
    nonce,
    util.decodeBase64(publicKey),
    util.decodeBase64(privateKey)
  );

	return {
		ciphertext: util.encodeBase64(ciphertext),
		nonce: util.encodeBase64(nonce),
	};
};

/**
 * Return assymmetrically decrypted [ciphertext] using [privateKey] where
 * [privateKey] likely belongs to the recipient.
 * @param {Object} obj
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.nonce - (base64) nonce
 * @param {String} obj.publicKey - (base64) public key of the sender
 * @param {String} obj.privateKey - (base64) private key of the receiver (current user)
 * @returns {String} plaintext - (utf8) plaintext
 */
const decryptAsymmetric = ({
	ciphertext,
	nonce,
	publicKey,
	privateKey,
}: IDecryptAsymmetricInput): string => {
    const plaintext: Uint8Array | null = nacl.box.open(
        util.decodeBase64(ciphertext),
        util.decodeBase64(nonce),
        util.decodeBase64(publicKey),
        util.decodeBase64(privateKey)
    );
  
    if (plaintext == null) throw BadRequestError({
        message: "Invalid ciphertext or keys",
    });
  
    return util.encodeUTF8(plaintext);
};

/**
 * Return symmetrically encrypted [plaintext] using [key].
 * 
 * NOTE: THIS FUNCTION SHOULD NOT BE USED FOR ALL FUTURE
 * ENCRYPTION OPERATIONS UNLESS IT TOUCHES OLD FUNCTIONALITY
 * THAT USES IT. USE encryptSymmetric() instead
 * 
 * @param {Object} obj
 * @param {String} obj.plaintext - (utf8) plaintext to encrypt
 * @param {String} obj.key - (hex) 128-bit key
 * @returns {Object} obj
 * @returns {String} obj.ciphertext (base64) ciphertext
 * @returns {String} obj.iv (base64) iv
 * @returns {String} obj.tag (base64) tag
 */
const encryptSymmetric128BitHexKeyUTF8 = ({
    plaintext,
    key,
}: IEncryptSymmetricInput) => {
    const iv = crypto.randomBytes(BLOCK_SIZE_BYTES_16);
    const cipher = crypto.createCipheriv(ALGORITHM_AES_256_GCM, key, iv);

    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    return {
        ciphertext,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
    };
}
/**
 * Return symmetrically decrypted [ciphertext] using [iv], [tag],
 * and [key].
 * 
 * NOTE: THIS FUNCTION SHOULD NOT BE USED FOR ALL FUTURE
 * DECRYPTION OPERATIONS UNLESS IT TOUCHES OLD FUNCTIONALITY
 * THAT USES IT. USE decryptSymmetric() instead
 * 
 * @param {Object} obj
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.iv - (base64) 256-bit iv
 * @param {String} obj.tag - (base64) tag
 * @param {String} obj.key - (hex) 128-bit key
 * @returns {String} cleartext - the deciphered ciphertext
 */
const decryptSymmetric128BitHexKeyUTF8 = ({
    ciphertext,
    iv,
    tag,
    key,
}: IDecryptSymmetricInput) => {
    const decipher = crypto.createDecipheriv(
        ALGORITHM_AES_256_GCM,
        key,
        Buffer.from(iv, "base64")
    );

    decipher.setAuthTag(Buffer.from(tag, "base64"));

    let cleartext = decipher.update(ciphertext, "base64", "utf8");
    cleartext += decipher.final("utf8");
    
    return cleartext;
}

export {
	generateKeyPair,
	encryptAsymmetric,
	decryptAsymmetric,
    encryptSymmetric128BitHexKeyUTF8,
    decryptSymmetric128BitHexKeyUTF8,
};
