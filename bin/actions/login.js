const netrc = require('netrc-rw');
const jsrp = require('jsrp');
const axios = require('axios');
const open = require('open');
const prompt = require('prompt-sync')();
const express = require('express');
const {
	LOGIN_HOST,
	KEYS_HOST,
	INFISICAL_URL
} = require('../variables');
const {
	decryptSymmetric
} = require('../utilities/crypto');

/**
 * Authenticate user via SRP protocol
*/
const login = async () => {
	
	let token, refreshToken, publicKey, encryptedPrivateKey, iv, tag;
	try {
		
		// prompt for user input
		const email = prompt('Email: ');
		const password = prompt('Password: ', { echo: '' });

		// login
		console.log('Logging in...');
		const client = new jsrp.client();

		client.init({
			username: email,
			password,
		}, async () => {
			const clientPublicKey = client.getPublicKey();
			
			let serverPublicKey, salt;
			try {
				const res = await axios.post(INFISICAL_URL + '/login1', {
					email,
					clientPublicKey
				});
				serverPublicKey = res.data.serverPublicKey;
				salt = res.data.salt;
			} catch (err) {
				console.error("❌ Error: Failed to validate your login credentials");
				process.exit(0);
			}

			client.setSalt(salt);
			client.setServerPublicKey(serverPublicKey);
			const clientProof = client.getProof(); // M1
			
			let res;
			try {
				res = await axios.post(INFISICAL_URL + '/login2', {
					email,
					clientProof
				});
			} catch (err) {
				console.error("❌ Error: Failed to validate your login credentials");
				process.exit(0);
			}

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


			console.log('✅ Logged in as ' + email);
			process.exit(0);
		});
	} catch (err) {
		console.log(err);
		console.error("❌ Error: Something went wrong while logging you in... Let's try that again");
		process.exit(1);
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

module.exports = login;
