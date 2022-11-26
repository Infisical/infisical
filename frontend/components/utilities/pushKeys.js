import uploadSecrets from "~/pages/api/files/UploadSecrets";
import getLatestFileKey from "~/pages/api/workspace/getLatestFileKey";
import getWorkspaceKeys from "~/pages/api/workspace/getWorkspaceKeys";

const crypto = require("crypto");
const {
	decryptAssymmetric,
	decryptSymmetric,
	encryptSymmetric,
	encryptAssymmetric,
} = require("../../components/utilities/crypto");
const nacl = require("tweetnacl");
nacl.util = require("tweetnacl-util");

const envMapping = {
	Development: "dev",
	Staging: "staging",
	Production: "prod",
	Testing: "test",
};

const pushKeys = async (obj, workspaceId, env) => {
	let sharedKey = await getLatestFileKey(workspaceId);

	const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

	let randomBytes;
	if (Object.keys(sharedKey).length > 0) {
		// case: a (shared) key exists for the workspace
		randomBytes = decryptAssymmetric({
			ciphertext: sharedKey.latestKey.encryptedKey,
			nonce: sharedKey.latestKey.nonce,
			publicKey: sharedKey.latestKey.sender.publicKey,
			privateKey: PRIVATE_KEY,
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
			plaintext: obj[key][0],
			key: randomBytes,
		});

		const visibility = obj[key][1] != null ? obj[key][1] : "personal";

		return {
			ciphertextKey,
			ivKey,
			tagKey,
			hashKey: crypto.createHash("sha256").update(key).digest("hex"),
			ciphertextValue,
			ivValue,
			tagValue,
			hashValue: crypto
				.createHash("sha256")
				.update(obj[key][0])
				.digest("hex"),
			type: visibility,
		};
	});

	// obtain public keys of all receivers (i.e. members in workspace)
	const publicKeys = await getWorkspaceKeys({
		workspaceId,
	});

	// assymmetrically encrypt key with each receiver public keys
	const keys = publicKeys.map((k) => {
		const { ciphertext, nonce } = encryptAssymmetric({
			plaintext: randomBytes,
			publicKey: k.publicKey,
			privateKey: PRIVATE_KEY,
		});

		return {
			encryptedKey: ciphertext,
			nonce,
			userId: k.userId,
		};
	});

	// send payload
	await uploadSecrets({
		workspaceId,
		secrets,
		keys,
		environment: envMapping[env],
	});
};

export default pushKeys;
