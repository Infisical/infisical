const netrc = require('netrc-rw');

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
		console.log("Failed to get your credentials. You may want to login with npx infisical login");
	}
	
	return credentials;
}

module.exports = {
	getCredentials
}

