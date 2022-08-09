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
 * Pull .env file from server to local. Follow steps:
 * 1. Get (encrypted) .env file and (assymetrically-encrypted) symmetric key
 * 2. Assymmetrically decrypt key with local private key
 * 3. Symmetrically decrypt .env file with key
*/
const pull = async () => {
	try {
		// read required local info
		const workspaceId = read(".env.infisical");
		const credentials = getCredentials({ host: KEYS_HOST });
		console.log('Pulling file...');
		const file = await getFile({ workspaceId });
		
		console.log('Decrypting file...');
		// assymmetrically decrypt symmetric key with local private key
		const key = decryptAssymmetric({
			ciphertext: file.key.encryptedKey,
			nonce: file.key.nonce,
			publicKey: file.key.sender.publicKey,
			privateKey: credentials.password
		});
		
		// decrypt .env file with symmetric key
		const plaintext = decryptSymmetric({
			ciphertext: file.latestFile.ciphertext,
			iv: file.latestFile.iv,
			tag: file.latestFile.tag,
			key
		});

		// overwrite existing .env file with new .env file
		write({
			fileName: '.env',
			content: plaintext
		});
		
	} catch (err) {
		console.error('❌ Error: Failed to pull .env file');
		process.exit(1);
	}
	
	console.log('✅ Successfully pulled latest .env file');
	process.exit(0);
}

module.exports = pull;
