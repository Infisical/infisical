const { readFile, writeFile } = require("../utilities/file");
const { getSecrets } = require("../api");
const { getCredentials } = require("../utilities/auth");
const { setup } = require("../utilities/setup");
const { decryptAsymmetric, decryptSymmetric } = require("../utilities/crypto");
const { decryptSecrets } = require("../utilities/secret");
const { KEYS_HOST } = require("../variables");

/*
 * Pull secrets from server to local. Follow steps:
 * 1. Get (encrypted) sectets and asymmetrically encrypted symmetric key
 * 2. Asymmetrically decrypt key with local private key
 * 3. Symmetrically decrypt secrets with key
 * @param {Object} obj
 * @param {String} obj.environment - dev, staging, or prod
 */
const pull = async ({ environment }) => {
	await setup();

	try {
		// read required local info
		const workspaceId = readFile(".env.infisical");
		const credentials = getCredentials({ host: KEYS_HOST });
		console.log("⬇️  Pulling file...");

		const secrets = await getSecrets({ workspaceId, environment });

		console.log("🔐 Decrypting file...");
		
		if (secrets.key) {
			// asymmetrically decrypt symmetric key with local private key
			const key = decryptAsymmetric({
				ciphertext: secrets.key.encryptedKey,
				nonce: secrets.key.nonce,
				publicKey: secrets.key.sender.publicKey,
				privateKey: credentials.password,
			});

			// decrypt secrets with symmetric key
			const content = decryptSecrets({
				secrets,
				key,
				format: "text",
			});

			writeFile({
				fileName: ".env",
				content,
			});
		}

	} catch (err) {
		console.error(err);
		console.error(
			`❌ Error: Failed to pull .env file for ${environment} environment`
		);
		process.exit(1);
	}

	console.log(
		`✅ Successfully pulled latest .env file for ${environment} environment`
	);
	process.exit(0);
};

module.exports = pull;
