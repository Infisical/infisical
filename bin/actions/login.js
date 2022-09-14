const netrc = require("netrc-rw");
const axios = require("axios");
const prompt = require("prompt-sync")({ sigint: true });
const { LOGIN_HOST, KEYS_HOST, INFISICAL_URL } = require("../variables");
const { authenticate } = require("../utilities/auth");

/**
 * Login user
 */
const login = async () => {
	let token, refreshToken, publicKey, encryptedPrivateKey, iv, tag;
	try {
		// prompt for user input
		const email = prompt("Email: ");
		const password = prompt("Password: ", { echo: "" });

		// login
		console.log("Logging in...");
		await authenticate({
			email,
			password,
		});

		console.log("✅ Logged in as " + email);
		process.exit(0);
	} catch (err) {
		console.error(err.message);
		process.exit(1);
	}
};

module.exports = login;
