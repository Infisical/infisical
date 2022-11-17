import crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const BLOCK_SIZE_BYTES = 16;

export default class AesGCM {
	constructor() {}

	static encrypt(
		text: string,
		secret: string
	): { ciphertext: string; iv: string; tag: string } {
		const iv = crypto.randomBytes(BLOCK_SIZE_BYTES);
		const cipher = crypto.createCipheriv(ALGORITHM, secret, iv);

		let ciphertext = cipher.update(text, 'utf8', 'base64');
		ciphertext += cipher.final('base64');
		return {
			ciphertext,
			iv: iv.toString('base64'),
			tag: cipher.getAuthTag().toString('base64')
		};
	}

	static decrypt(
		ciphertext: string,
		iv: string,
		tag: string,
		secret: string
	): string {
		const decipher = crypto.createDecipheriv(
			ALGORITHM,
			secret,
			Buffer.from(iv, 'base64')
		);
		decipher.setAuthTag(Buffer.from(tag, 'base64'));

		let cleartext = decipher.update(ciphertext, 'base64', 'utf8');
		cleartext += decipher.final('utf8');

		return cleartext;
	}
}
