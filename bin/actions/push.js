const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const netrc = require("netrc-rw");
const prompt = require("prompt-sync")({ sigint: true });
const { readFile, parse } = require("../utilities/file");
const {
	encryptSymmetric,
	decryptSymmetric,
	encryptAsymmetric,
	decryptAsymmetric,
} = require("../utilities/crypto");
const { getCredentials } = require("../utilities/auth");
const { setup } = require("../utilities/setup");
const { getWorkspaceKeys, getSharedKey, uploadSecrets } = require("../api");
const { KEYS_HOST } = require("../variables");

const { getSecrets } = require("../api");
const { decryptSecrets } = require("../utilities/secret");

/**
 * Push secrets from local to server. Follows steps:
 * 1. Read .env file
 * --- Pull secrets
 * 2. Get (encrypted) secrets and asymmetrically encrypted symmetric key
 * 3. Asymmetrically decrypt key with local private key
 * 4. Symmetrically decrypt secrets with key
 * --- Push secrets
 * 5. Symmetrically encrypt each read secret (key and value) with (shared) key
 * 6. For each read secret, check if it's new and prompt user for intended type (shared/personal)
 * 7. Asymmetrically encrypt the (shared) key with each receiver public keys
 * 8. Package and send 2-3 to server
 * @param {Object} obj
 * @param {String} obj.environment - dev, staging, or prod
 */
const push = async ({ environment }) => {
	await setup();
	let randomBytes;
	try {
		// read required local info
		const credentials = getCredentials({ host: KEYS_HOST });

		const file = readFile(".env");
		const obj = parse(file);
		const workspaceId = readFile(".env.infisical");

		const oldSecrets = await getSecrets({ workspaceId, environment });
		
		let content = {};
		if (oldSecrets.key) {
			const key = decryptAsymmetric({
				ciphertext: oldSecrets.key.encryptedKey,
				nonce: oldSecrets.key.nonce,
				publicKey: oldSecrets.key.sender.publicKey,
				privateKey: credentials.password,
			});

			content = decryptSecrets({
				secrets: oldSecrets,
				key,
				format: "expanded",
			});
		}

		console.log("🔐 Encrypting file...");
		let sharedKey = await getSharedKey({ workspaceId });

		if (sharedKey) {
			// case: a (shared) key exists for the workspace
			randomBytes = decryptAsymmetric({
				ciphertext: sharedKey.encryptedKey,
				nonce: sharedKey.nonce,
				publicKey: sharedKey.sender.publicKey,
				privateKey: credentials.password
			});
		} else {
			// case: a (shared) key does not exist for the workspace
			randomBytes = crypto.randomBytes(16).toString("hex");
		}

		const secrets = Object.keys(obj).map((key) => {
			// encrypt key
			const {
				ciphertext: ciphertextKey,
				iv: ivKey,
				tag: tagKey,
			} = encryptSymmetric({
				plaintext: key,
				key: randomBytes,
			});

			// encrypt value
			const {
				ciphertext: ciphertextValue,
				iv: ivValue,
				tag: tagValue,
			} = encryptSymmetric({
				plaintext: obj[key],
				key: randomBytes,
			});
			
			let type;
			if (key in content) {
				// case: existing secret
				// -> inherit previous secret type
				type = content[key].type;
			} else {
				// case: new secret
				// -> prompt user to specify secret type
				let isValidType;
				
				while (!isValidType) {
					console.log("📝 Enter a type (shared/personal) for the key: " + key);
					const input = prompt("Type: ");
					if (input === "shared" || input === "personal") {
						type = input
						isValidType = true;
						break;
					}

					console.log("❌ Error: Invalid type entered. Let's try that again.");
				}
			}

			return {
				ciphertextKey,
				ivKey,
				tagKey,
				hashKey: crypto.createHash("sha256").update(key).digest("hex"),
				ciphertextValue,
				ivValue,
				tagValue,
				hashValue: crypto.createHash("sha256").update(obj[key]).digest("hex"),
				type
			};
		});

		console.log("🔑 Generating access keys...");

		// obtain public keys of all receivers (i.e. members in workspace)
		const publicKeys = await getWorkspaceKeys({
			workspaceId,
		});

		// assymmetrically encrypt key with each receiver public keys
		const keys = publicKeys.map((k) => {
			const { ciphertext, nonce } = encryptAsymmetric({
				plaintext: randomBytes,
				publicKey: k.publicKey,
				privateKey: credentials.password,
			});

			return {
				encryptedKey: ciphertext,
				nonce,
				userId: k.userId,
			};
		});

		console.log("⬆️  Pushing file...");
		await uploadSecrets({
			workspaceId,
			secrets,
			keys,
			environment,
		});
	} catch (err) {
		console.error(err);
		console.error(
			`❌ Error: Failed to push .env file for ${environment} environment`
		);
		process.exit(1);
	}

	console.log(
		`✅ Successfully uploaded .env file for ${environment} environment`
	);
	process.exit(0);
};

module.exports = push;
