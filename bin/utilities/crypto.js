const nacl = require("tweetnacl");
nacl.util = require("tweetnacl-util");
const aes = require("./aesgcm");

/**
 * Return asymmetrically encrypted [plaintext] using [publicKey] where
 * [publicKey] likely belongs to the recipient.
 * @param {Object} obj
 * @param {String} obj.plaintext - plaintext to encrypt
 * @param {String} obj.publicKey - public key of the recipient
 * @param {String} obj.privateKey - private key of the sender (current user)
 * @returns {Object} obj
 * @returns {String} ciphertext - base64-encoded ciphertext
 * @returns {String} nonce - base64-encoded nonce
 */
const encryptAsymmetric = ({ plaintext, publicKey, privateKey }) => {
	const nonce = nacl.randomBytes(24);
	const ciphertext = nacl.box(
		nacl.util.decodeUTF8(plaintext),
		nonce,
		nacl.util.decodeBase64(publicKey),
		nacl.util.decodeBase64(privateKey)
	);

	return {
		ciphertext: nacl.util.encodeBase64(ciphertext),
		nonce: nacl.util.encodeBase64(nonce),
	};
};

/**
 * Return asymmetrically decrypted [ciphertext] using [privateKey] where
 * [privateKey] likely belongs to the recipient.
 * @param {Object} obj
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.nonce - nonce
 * @param {String} obj.publicKey - base64-encoded public key of the sender
 * @param {String} obj.privateKey - base64-encoded private key of the receiver (current user)
 * @param {String} plaintext - UTF8 plaintext
 */
const decryptAsymmetric = ({ ciphertext, nonce, publicKey, privateKey }) => {
	const plaintext = nacl.box.open(
		nacl.util.decodeBase64(ciphertext),
		nacl.util.decodeBase64(nonce),
		nacl.util.decodeBase64(publicKey),
		nacl.util.decodeBase64(privateKey)
	);

	return nacl.util.encodeUTF8(plaintext);
};

/**
 * Return symmetrically encrypted [plaintext] using [key].
 * @param {Object} obj
 * @param {String} obj.plaintext - plaintext to encrypt
 * @param {String} obj.key - 16-byte hex key
 */
const encryptSymmetric = ({ plaintext, key }) => {
	let ciphertext, iv, tag;
	try {
		const obj = aes.encrypt(plaintext, key);
		ciphertext = obj.ciphertext;
		iv = obj.iv;
		tag = obj.tag;
	} catch (err) {
		process.exit(1);
	}

	return {
		ciphertext,
		iv,
		tag,
	};
};

/**
 * Return symmetrically decypted [ciphertext] using [iv], [tag],
 * and [key].
 * @param {Object} obj
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.iv - iv
 * @param {String} obj.tag - tag
 * @param {String} obj.key - 32-byte hex key
 *
 */
const decryptSymmetric = ({ ciphertext, iv, tag, key }) => {
	let plaintext;
	try {
		plaintext = aes.decrypt(ciphertext, iv, tag, key);
	} catch (err) {
		process.exit(1);
	}

	return plaintext;
};

module.exports = {
	encryptAsymmetric,
	decryptAsymmetric,
	encryptSymmetric,
	decryptSymmetric
};
