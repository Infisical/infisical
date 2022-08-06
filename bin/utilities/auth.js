const netrc = require('netrc-rw');
const {
	LOGIN_HOST
} = require('../variables');

/**
 * Get existing token in .netrc file
*/
const getToken = () => {
	let token;
	try {
		token = netrc.host(LOGIN_HOST).password;
	} catch (err) {
		console.log("You need to authenticate. Run npx infisical login");
		process.exit(1);
	}
	
	return token
}

module.exports = {
	getToken
}
