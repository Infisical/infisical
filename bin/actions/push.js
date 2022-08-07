const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const netrc = require('netrc-rw');
const {
	read,
	parse
} = require('../utilities/file');
const {
	encryptSymmetric,
	decryptSymmetric,
	encryptAssymmetric
} = require('../utilities/crypto');
const {
	getCredentials
} = require('../utilities/auth');
const {
	getWorkspaceKeys,
	uploadFile
} = require('../api');
const {
	KEYS_HOST
} = require('../variables');

/**
 * Push .env file from local to server. Follows steps:
 * 1. Read .env file
 * 2. Symmetrically encrypt .env file with random key
 * 3. Assymmetrically encrypt key with each receiver public keys
 * 4. Package and send 2-3 to server
*/
const push = async () => {
		
	try {
		// read required local info
		const credentials = getCredentials({ host: KEYS_HOST });

		const file = read(".env");
		const workspaceId = read(".env.infisical");
		
		console.log('Encrypting file...');
		// generate (hex) symmetric key
		const randomBytes = crypto.randomBytes(16).toString('hex');
		
		// encrypt .env file with symmetric key
		const {
			ciphertext,
			iv,
			tag
		} = encryptSymmetric({
			plaintext: file,
			key: randomBytes
		});
		
		console.log('Generating access keys...');
		// obtain public keys of all receivers (i.e. members in workspace)
		const publicKeys = await getWorkspaceKeys({
			workspaceId
		});
		
		// assymmetrically encrypt key with each receiver public keys
		const keys = publicKeys.map(k => {
			const { ciphertext, nonce } = encryptAssymmetric({
				plaintext: randomBytes,
				publicKey: k.publicKey,
				privateKey: credentials.password
			});
			
			return ({
				encryptedKey: ciphertext,
				nonce,
				userId: k.userId
			});
		});

		console.log('Pushing file...');
		// send payload
		await uploadFile({
			workspaceId,
			ciphertext,
			iv,
			tag,
			keys
		});
	} catch (err) {
		console.error('❌ Error: Failed to push .env file');
		process.exit(1);
	}
	
	console.log('✅ Successfully uploaded .env file');
	process.exit(0);
}

module.exports = push;
