#! /usr/bin/env node
const {
	read,
	write
} = require('../utilities/file');
const {
	getFile
} = require('../api');
const {
	getCredentials
} = require('../utilities/auth');
const {
	decryptAssymmetric,
	decryptSymmetric
} = require('../utilities/crypto');
const {
	KEYS_HOST
} = require('../variables');

/**
 * Pull .env file
 * [Elaborate more on mechanism]
*/
const pull = async () => {
	try {
		const credentials = getCredentials({
			host: KEYS_HOST
		});

		const workspaceId = read(".env.infisical");

		const file = await getFile({
			workspaceId
		});
		
		// assymmetrically decrypt key with local private key
		const key = decryptAssymmetric({
			ciphertext: file.key.encryptedKey,
			nonce: file.key.nonce,
			publicKey: file.key.sender.publicKey,
			privateKey: credentials.password
		});
		
		// decrypt .env file
		const plaintext = decryptSymmetric({
			ciphertext: file.latestFile.ciphertext,
			iv: file.latestFile.iv,
			tag: file.latestFile.tag,
			key
		});

		// overwrite existing .env file with new plaintext
		write({
			fileName: '.env',
			content: plaintext
		});
		
	} catch (err) {
		console.log(err);
		console.log('Failed to pull .env file');
		process.exit(1);
	}
	
	console.log('Successfully pulled the latest .env file');
	process.exit(0);
}

module.exports = pull;
