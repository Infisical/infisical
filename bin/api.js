const axios = require('axios');
const {
	INFISICAL_URL,
	LOGIN_HOST
} = require('./variables');
const {
	getCredentials
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
	const URL = INFISICAL_URL + "/workspace/" + workspaceId + "/connect";
	// TODO: add token
	
	const credentials = getCredentials({
		host: LOGIN_HOST
	});

	let response;
	try {
		response = await axios.get(URL, {
			headers: {
				'Authorization': 'Bearer ' + credentials.password
			}
		});
	} catch (err) {
		console.log("Failed to connect to workspace. Double-check that you're authorized for it");
		process.exit(1);
	}
}

const workspaceMemberPublicKeys = async ({
	workspaceId
}) => {
	const URL = INFISICAL_URL + "/workspace/" + workspaceId + "/publicKeys";
	
	const credentials = getCredentials({
		host: LOGIN_HOST
	});
	
	let response;
	try {
		response = await axios.get(URL, {
			headers: {
				'Authorization': 'Bearer ' + credentials.password
			}
		});
	} catch (err) {
		console.log(err);
		console.log("Failed to connect to workspace. Double-check that you're authorized for it");
		process.exit(1);
	}
	
	return response.data.publicKeys;
}

const uploadFile = async ({
	workspaceId,
	ciphertext,
	iv,
	tag,
	keys
}) => {
	const URL = INFISICAL_URL + "/file"
	
	const credentials = getCredentials({
		host: LOGIN_HOST
	});
	
	let response;
	try {
		response = await axios.post(URL, {
			workspaceId,
			ciphertext,
			iv,
			tag,
			keys
		}, {
			headers: {
				'Authorization': 'Bearer ' + credentials.password
			}
		});
	} catch (err) {
		console.log("Failed to upload .env file. Check your connection");
		process.exit(1);
	}
	
	return response;
}


const getFile = async ({
	workspaceId
}) => {
	const URL = INFISICAL_URL + "/file/" + workspaceId
	
	const credentials = getCredentials({
		host: LOGIN_HOST
	});

	let response;
	try {
		response = await axios.get(URL, {
			headers: {
				'Authorization': 'Bearer ' + credentials.password
			}
		});
	} catch (err) {
		console.log(err);
		console.log("Failed to pull the latest .env file");
		process.exit(1);
	}
	
	return response.data;
}

module.exports = {
	getInfisicalPublicKey,
	connectToWorkspace,
	workspaceMemberPublicKeys,
	uploadFile,
	getFile
}
