const netrc = require('netrc-rw');
const jsrp = require('jsrp');
const axios = require('axios');

/** Return set of specified host credentials from
 * .netrc file.
 * @param {Object} obj
 * @param {String} host - LOGIN_HOST or KEYS_HOST
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

module.exports = {
	getCredentials
}

