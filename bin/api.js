const axios = require('axios');
const {
	INFISICAL_URL,
	LOGIN_HOST
} = require('./variables');
const {
	getCredentials
} = require('./utilities/auth');


const connectToWorkspace = async ({
	workspaceId
}) => {
	const credentials = getCredentials({
		host: LOGIN_HOST
	});
	let response;
	try {
		response = await axios.get(INFISICAL_URL + '/workspace/' + workspaceId + '/connect', {
			headers: {
				'Authorization': 'Bearer ' + credentials.password
			}
		});
	} catch (err) {
		console.error("Error: Something went wrong while processing a network request");
		process.exit(1);
	}
}

const getWorkspaceKeys = async ({
	workspaceId
}) => {
	const credentials = getCredentials({
		host: LOGIN_HOST
	});
	let response;
	try {
		response = await axios.get(INFISICAL_URL + '/workspace/' + workspaceId + '/keys', {
			headers: {
				'Authorization': 'Bearer ' + credentials.password
			}
		});
	} catch (err) {
		console.error("Error: Something went wrong while processing a network request");
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
	const credentials = getCredentials({
		host: LOGIN_HOST
	});
	let response;
	try {
		response = await axios.post(INFISICAL_URL + '/file', {
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
		console.error("Error: Something went wrong while processing a network request");
		process.exit(1);
	}
	
	return response;
}

const getFile = async ({
	workspaceId
}) => {
	const credentials = getCredentials({
		host: LOGIN_HOST
	});
	let response;
	try {
		response = await axios.get(INFISICAL_URL + '/file/' + workspaceId, {
			headers: {
				'Authorization': 'Bearer ' + credentials.password
			}
		});
	} catch (err) {
		console.error("❌ Error: " + err.response.data.message);
		process.exit(1);
	}
	
	return response.data;
}

module.exports = {
	connectToWorkspace,
	getWorkspaceKeys,
	uploadFile,
	getFile
}
