const netrc = require('netrc-rw');
const open = require('open');
const express = require('express');
const {
	getInfisicalPublicKey,
	postLogin
} = require('../api');
const {
	INFISICAL_URL,
	LOGIN_HOST,
	KEYS_HOST
} = require('../variables');

/**
 * Redirect to browser CLI login to authenticate and retrieve/sync
 * token, public/private key information.
*/
const login = async () => {
	// login

	try {
		// TODO: redirect to /login/cli
		open('https://infisical.com/login');
		
		// TODO: figure out open ports and relay that information in open
		const PORT = 3005;
		const TIMEOUT_MS = 120000;
		
		// open server on free port as part of browser SSO
		const app = express();
		app.use(express.json());
		app.post('/auth', (req, res) => {
			// save redirected login credentials
			const { status } = req.query;
			
			if (status == 'fail') {
				console.log("Failed to authenticate");
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
			console.log('Logged in as ' + email);
			
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
		
		const server = app.listen(PORT, () => {
			console.log("Opening browser to https://infisical.com/login/cli");
			setTimeout(() => {
				console.log('Authentication session timed out.');
				server.close();
				process.exit(0);
			}, TIMEOUT_MS);
		});

	} catch (err) {
		console.log("Ouch. Someting went wrong while logging you in... Let's try that again");
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
