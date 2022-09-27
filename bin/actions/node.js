const { spawn } = require("child_process");
const { readFile } = require("../utilities/file");
const { checkAuth, checkConnect, getSecrets } = require("../api");
const { getCredentials, authenticate } = require("../utilities/auth");
const { setup } = require("../utilities/setup");
const { decryptAsymmetric, decryptSymmetric } = require("../utilities/crypto");
const { decryptSecrets } = require("../utilities/secret");
const { LOGIN_HOST, KEYS_HOST, NODE } = require("../variables");

/**
 * Start server with latest secrets fetched and injected into
 * the running environment. Follow steps:
 * 1. Get (encrypted) sectets and asymmetrically encrypted) symmetric key
 * 2. Asymmetrically decrypt key with local private key
 * 3. Symmetrically decrypt secrets with key
 * 4. Start child process (i.e. server) with secrets injected
 * @param {Object} obj
 * @param {Array} obj.args - command arguments
 */
const node = async ({ args }) => {
	await setup();

	try {
		const workspaceId = readFile(".env.infisical");
		const credentials = getCredentials({ host: KEYS_HOST });

		console.log("⬇️  Pulling secrets...");

		const secrets = await getSecrets({ workspaceId, environment: args[0] });

		console.log("🔐 Decrypting secrets...");

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
			format: "object",
		});

		console.log(`💉 Injecting ${args[0]} secrets into environment... \n`);
		const child = spawn(args[1], args.slice(2), {
			env: {
				...process.env,
				...content,
			},
		});

		child.stdout.on("data", (data) => {
			console.log("" + data);
		});

		child.stderr.on("data", (data) => {
			console.log("stderr: " + data);
		});

		child.on("error", (error) => console.log("error: " + error.message));
		child.on("exit", (code, signal) => {
			if (code) console.log("Process exited with code " + code);
			if (signal) console.log("Process exited with signal " + signal);
		});
	} catch (err) {
		console.error(err);
		console.error(
			"❌ Error: Something went wrong while fetching and injecting secrets into your local environment"
		);
	}
};

module.exports = node;
