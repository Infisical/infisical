const netrc = require('netrc-rw');
const open = require('open');
const express = require('express');
const {
	LOGIN_HOST,
	KEYS_HOST
} = require('../variables');

/**
 * Redirect to browser SSO to authenticate and obtain/sync credentials
 * (i.e. token and keys information).
 * Dynamically opens a port to catch credentially.
*/
const login = async () => {

	try {
		const PORT = 0; // dynamic port
		const TIMEOUT_MS = 120000;
		
		// open server on free port as part of browser SSO
		const app = express();
		app.use(express.json());
		app.post('/auth', (req, res) => {

			// save redirected login credentials
			const { status } = req.query;
			
			if (status == 'fail') {
				console.error("❌ Error: Failed to authenticate");
				res.status(400).send({
					message: 'Failed to authenticate'
				});
				server.close();
				process.exit(1);
			}
			
			const {
				email,
				publicKey,
				privateKey,
				token
			} = req.body;

			console.log('Logging in... done');
			console.log('✅ Logged in as ' + email);
			
			// update authentication information on file
			updateNetRC({
				host: LOGIN_HOST,
				login: email,
				password: token
			});

			// update key information on file
			updateNetRC({
				host: KEYS_HOST,
				login: publicKey,
				password: privateKey
			});

			res.status(200).send({
				message: 'Logged in as ' + email
			});
			server.close();
			process.exit(0);
		});
		
		// start server to catch credentials upon redirect
		const server = app.listen(PORT, () => {
			console.log("Opening browser to https://infisical.com/login/cli?port=" + server.address().port);
			console.log('infisical: Waiting for login...');
			
			// redirect to browser SSO link
			open('https://infisical.com/login/cli?port=' + server.address().port);
			setTimeout(() => {
				console.error('❌ Error: Authentication session timed out.');
				server.close();
				process.exit(0);
			}, TIMEOUT_MS);
		});

	} catch (err) {
		console.error("Error: Someting went wrong while logging you in... Let's try that again");
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
