import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import AesGCM from './aes-gcm';

/**
 * Return assymmetrically encrypted [plaintext] using [publicKey] where
 * [publicKey] likely belongs to the recipient.
 * @param {Object} obj
 * @param {String} obj.plaintext - plaintext to encrypt
 * @param {String} obj.publicKey - public key of the recipient
 * @param {String} obj.privateKey - private key of the sender (current user)
 * @returns {Object} obj
 * @returns {String} ciphertext - base64-encoded ciphertext
 * @returns {String} nonce - base64-encoded nonce
 */
const encryptAsymmetric = ({
	plaintext,
	publicKey,
	privateKey
}: {
	plaintext: string;
	publicKey: string;
	privateKey: string;
}) => {
	let nonce, ciphertext;
	try {
		nonce = nacl.randomBytes(24);
		ciphertext = nacl.box(
			util.decodeUTF8(plaintext),
			nonce,
			util.decodeBase64(publicKey),
			util.decodeBase64(privateKey)
		);
	} catch (err) {
		throw new Error('Failed to perform asymmetric encryption');
	}

	return {
		ciphertext: util.encodeBase64(ciphertext),
		nonce: util.encodeBase64(nonce)
	};
};

/**
 * Return assymmetrically decrypted [ciphertext] using [privateKey] where
 * [privateKey] likely belongs to the recipient.
 * @param {Object} obj
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.nonce - nonce
 * @param {String} obj.publicKey - public key of the sender
 * @param {String} obj.privateKey - private key of the receiver (current user)
 * @param {String} plaintext - UTF8 plaintext
 */
const decryptAsymmetric = ({
	ciphertext,
	nonce,
	publicKey,
	privateKey
}: {
	ciphertext: string;
	nonce: string;
	publicKey: string;
	privateKey: string;
}): string => {
	let plaintext: any;
	try {
		plaintext = nacl.box.open(
			util.decodeBase64(ciphertext),
			util.decodeBase64(nonce),
			util.decodeBase64(publicKey),
			util.decodeBase64(privateKey)
		);
	} catch (err) {
		throw new Error('Failed to perform asymmetric decryption');
	}

	return util.encodeUTF8(plaintext);
};

/**
 * Return symmetrically encrypted [plaintext] using [key].
 * @param {Object} obj
 * @param {String} obj.plaintext - plaintext to encrypt
 * @param {String} obj.key - 16-byte hex key
 */
const encryptSymmetric = ({
	plaintext,
	key
}: {
	plaintext: string;
	key: string;
}) => {
	let ciphertext, iv, tag;
	try {
		const obj = AesGCM.encrypt(plaintext, key);
		ciphertext = obj.ciphertext;
		iv = obj.iv;
		tag = obj.tag;
	} catch (err) {
		throw new Error('Failed to perform symmetric encryption');
	}

	return {
		ciphertext,
		iv,
		tag
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
const decryptSymmetric = ({
	ciphertext,
	iv,
	tag,
	key
}: {
	ciphertext: string;
	iv: string;
	tag: string;
	key: string;
}): string => {
	let plaintext;
	try {
		plaintext = AesGCM.decrypt(ciphertext, iv, tag, key);
	} catch (err) {
		throw new Error('Failed to perform symmetric decryption');
	}

	return plaintext;
};

export {
	encryptAsymmetric,
	decryptAsymmetric,
	encryptSymmetric,
	decryptSymmetric
};
