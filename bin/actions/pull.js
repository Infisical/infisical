const {
	read,
	write
} = require('../utilities/file');
const {
	getSecrets
} = require('../api');
const {
	getCredentials
} = require('../utilities/auth');
const {
	decryptAsymmetric,
	decryptSymmetric
} = require('../utilities/crypto');
const {
	KEYS_HOST
} = require('../variables');

/* 
 * Pull secrets from server to local. Follow steps:
 * 1. Get (encrypted) sectets and asymmetrically encrypted) symmetric key
 * 2. Asymmetrically decrypt key with local private key
 * 3. Symmetrically decrypt secrets with key
 * @param {String} environment - dev, staging, or prod
 */
const pull = async ({
	environment
}) => {
	try {
		// read required local info
		const workspaceId = read(".env.infisical");
		const credentials = getCredentials({ host: KEYS_HOST });
		console.log("Pulling file...");

		const secrets = await getSecrets({ workspaceId, environment });
		
		console.log("Decrypting file...");

		// asymmetrically decrypt symmetric key with local private key
		const key = decryptAsymmetric({
			ciphertext: secrets.key.encryptedKey,
			nonce: secrets.key.nonce,
			publicKey: secrets.key.sender.publicKey,
			privateKey: credentials.password
		});
		
		// decrypt secrets with symmetric key
		let content = '';
		secrets.secrets.forEach((sp, idx) => {

			const secretKey = decryptSymmetric({
				ciphertext: sp.secretKey.ciphertext,
				iv: sp.secretKey.iv,
				tag: sp.secretKey.tag,
				key
			});

			const secretValue = decryptSymmetric({
				ciphertext: sp.secretValue.ciphertext,
				iv: sp.secretValue.iv,
				tag: sp.secretValue.tag,
				key
			});
			
			content += secretKey;
			content += '=';
			content += secretValue;
			
			if (idx < secrets.secrets.length) {
				content += '\n';
			}
		});
		
		write({
			fileName: '.env',
			content
		});
	} catch (err) {
		console.error("❌ Error: Failed to pull .env file for ${environment} environment");
		process.exit(1);
	}
	
	console.log(`✅ Successfully pulled latest .env file for ${environment} environment`);
	process.exit(0);
}

module.exports = pull;
