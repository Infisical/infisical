const netrc = require('netrc-rw');
const jsrp = require('jsrp');
const axios = require('axios');
const {
	decryptSymmetric
} = require("./crypto");
const {
	INFISICAL_URL,
	LOGIN_HOST,
	KEYS_HOST
} = require("../variables");

/** Return set of specified host credentials from
 * .netrc file.
 * @param {Object} obj
 * @param {String} obj.host - LOGIN_HOST or KEYS_HOST
*/
const getCredentials = ({
	host
}) => {
	let credentials;
	try {
		credentials = netrc.host(host);
	} catch (err) {
		console.error("❌ Error: Failed to get local credentials. Log in with 'npx infisical login'");
		process.exit(0);
	}
	
	return credentials;
}

/**
 * Authenticate user with SRP
 * @param {Object} obj
 * @param {Object} obj.email - email
 * @param {Object} obj.password - password
 * @return {Boolean} success - whether or not user successfully authenticated
e*/
const authenticate = async ({
	email,
	password
}) => {
	const promise = new Promise(function (resolve, reject) {
		const client = new jsrp.client();
		client.init({
			username: email,
			password,
		}, async () => {
			try {
				const clientPublicKey = client.getPublicKey();
				
				let serverPublicKey, salt;
				let res = await axios.post(INFISICAL_URL + '/login1', {
					email,
					clientPublicKey
				});
				serverPublicKey = res.data.serverPublicKey;
				salt = res.data.salt;

				client.setSalt(salt);
				client.setServerPublicKey(serverPublicKey);
				const clientProof = client.getProof(); // M1
				
				res = await axios.post(INFISICAL_URL + '/login2', {
					email,
					clientProof
				});

				// decrypt private key
				const privateKey = decryptSymmetric({
					ciphertext: res.data.encryptedPrivateKey,
					iv: res.data.iv,
					tag: res.data.tag,
					key: password.slice(0, 32).padStart(32, '0')
				});

				// update authentication information on file
				updateNetRC({
					host: LOGIN_HOST,
					login: email,
					password: res.data.token
				});

				// update key information on file
				updateNetRC({
					host: KEYS_HOST,
					login: res.data.publicKey,
					password: privateKey
				});
				resolve();
			} catch (err) {
				reject("Failed to login");
			}
		});
	});
	
	try {
		await promise;
	} catch (err) {
		throw new Error("❌ Error: Something went wrong while logging you in... Let's try that again");
	}
}

/**
 * Overwrite NetRC file with new credentails.
 * @param {Object} obj
 * @param {String} obj.host - new host information
 * @param {String} obj.login - new username information
 * @param {String} obj.password - new password information
*/
const updateNetRC = ({
	host,
	login,
	password
}) => {
	
	try {
		let credentials = netrc.host(host);
		
		// host exists
		netrc.host(host).login = login;
		netrc.host(host).password = password;
		netrc.write();

	} catch (err) {
		// host doesn't exist
		netrc.addHost(host).password = password;
		netrc.write();
		netrc.host(host).login = login;
		netrc.write();
	}
}

module.exports = {
	getCredentials,
	authenticate
}

