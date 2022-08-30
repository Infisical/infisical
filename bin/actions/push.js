const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const netrc = require("netrc-rw");
const { read, parse } = require("../utilities/file");
const {
	encryptSymmetric,
	decryptSymmetric,
	encryptAsymmetric,
	decryptAsymmetric
} = require("../utilities/crypto");
const { getCredentials } = require("../utilities/auth");
const { getWorkspaceKeys, getSharedKey, uploadFile, uploadSecrets } = require("../api");
const { KEYS_HOST } = require("../variables");

/**
 * Push secrets from local to server. Follows steps:
 * 1. Read .env file
 * 2. Symmetrically encrypt each secret (key and value) with (shared) key
 * 3. Asymmetrically encrypt the (shared) key with each receiver public keys
 * 4. Package and send 2-3 to server
 */
const push = async () => {

	let randomBytes;
	try {
		// read required local info
		const credentials = getCredentials({ host: KEYS_HOST });

		const file = read(".env");
		const obj = parse(file);
		const workspaceId = read(".env.infisical");

		console.log("Encrypting file...");

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

			return {
				ciphertextKey,
				ivKey,
				tagKey,
				hashKey: crypto.createHash("sha256").update(key).digest("hex"),
				ciphertextValue,
				ivValue,
				tagValue,
				hashValue: crypto.createHash("sha256").update(obj[key]).digest("hex"),
			};
		});

		console.log("Generating access keys...");

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

		console.log("Pushing file...");
		await uploadSecrets({
			workspaceId,
			secrets,
			keys,
		});
	} catch (err) {
		console.error("❌ Error: Failed to push .env file");
		process.exit(1);
	}

	console.log("✅ Successfully uploaded .env file");
	process.exit(0);
};

module.exports = push;
