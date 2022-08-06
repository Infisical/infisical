const axios = require('axios');
const {
	INFISICAL_URL
} = require('./variables');
const {
	getToken
} = require('./utilities/auth');

// consider renaming these functions

const postLogin = async ({
	login,
	password
}) => {
	const URL = INFISICAL_URL + "/login";
	
	let response;
	try {
		response = await axios.get(URL);
	} catch (err) {
		console.log("Failed to authenticate to Infisical. Try again?");
		process.exit(1);
	}

	return response.data.token;
}

const getInfisicalPublicKey = async () => {
	const URL = INFISICAL_URL + "/publicKey/infisical";

	let response;
	try {
		response = await axios.get(URL);
	} catch (err) {
		console.log("Failed to connect to Infisical. Check your connection");
		process.exit(1);
	}
	
	return response.data.publicKey;
}

const connectToWorkspace = async ({
	workspaceId
}) => {
	const URL = INFISICAL_URL + "/workspace/connect/" + workspaceId;
	// TODO: add token
	
	const token = getToken();

	let response;
	try {
		response = await axios.get(URL, {
			headers: {
				'Authorization': 'Bearer ' + token
			}
		});
	} catch (err) {
		console.log("Failed to connect to workspace. Double-check that you're authorized for it");
		process.exit(1);
	}
}

module.exports = {
	getInfisicalPublicKey,
	connectToWorkspace
}
