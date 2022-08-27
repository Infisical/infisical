const axios = require("axios");
const { INFISICAL_URL, LOGIN_HOST } = require("./variables");
const { getCredentials } = require("./utilities/auth");

const connectToWorkspace = async ({ workspaceId }) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});
	let response;
	try {
		response = await axios.get(
			INFISICAL_URL + "/membership/" + workspaceId + "/connect",
			{
				headers: {
					Authorization: "Bearer " + credentials.password,
				},
			}
		);
	} catch (err) {
		console.error(
			"❌ Error: Failed to connect to workspace with id " + workspaceId
		);
		process.exit(1);
	}
};

const getWorkspaceKeys = async ({ workspaceId }) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});
	let response;
	try {
		response = await axios.get(
			INFISICAL_URL + "/workspace/" + workspaceId + "/keys",
			{
				headers: {
					Authorization: "Bearer " + credentials.password,
				},
			}
		);
	} catch (err) {
		console.error(
			"❌ Error: Something went wrong while processing a network request"
		);
		process.exit(1);
	}

	return response.data.publicKeys;
};

const getSharedKey = async ({ workspaceId }) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});
	let response;
	try {
		response = await axios.get(
			INFISICAL_URL + "/key2/" + workspaceId + "/latest",
			{
				headers: {
					Authorization: "Bearer " + credentials.password,
				},
			}
		);
	} catch (err) {
		console.error(err);
		console.error(
			"❌ Error: Something went wrong while processing a network request"
		);
		process.exit(1);
	}

	return response?.latestKey;
};

const uploadFile = async ({ workspaceId, hash, ciphertext, iv, tag, keys }) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});
	let response;
	try {
		response = await axios.post(
			INFISICAL_URL + "/file",
			{
				workspaceId,
				hash,
				ciphertext,
				iv,
				tag,
				keys,
			},
			{
				headers: {
					Authorization: "Bearer " + credentials.password,
				},
			}
		);
	} catch (err) {
		console.error(
			"❌ Error: Something went wrong while processing a network request"
		);
		process.exit(1);
	}

	return response;
};

const uploadSecrets = async ({ 
	workspaceId, 
	secrets,
	keys
}) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});

	let response;
	try {
		response = await axios.post(
			INFISICAL_URL + "/secret/" + workspaceId,
			{
				workspaceId,
				secrets,
				keys
			},
			{
				headers: {
					Authorization: "Bearer " + credentials.password,
				},
			}
		);
	} catch (err) {
		console.error(err);
		console.error(
			"❌ Error: Something went wrong while processing a network request"
		);
		process.exit(1);
	}

	return response;
};

const getFile = async ({ workspaceId }) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});

	let response;
	try {
		response = await axios.get(INFISICAL_URL + "/file/" + workspaceId, {
			headers: {
				Authorization: "Bearer " + credentials.password,
			},
		});
	} catch (err) {
		console.error("❌ Error: " + err.response.data.message);
		process.exit(1);
	}

	return response.data;
};

const getSecrets = async ({ workspaceId }) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});

	let response;
	try {
		response = await axios.get(INFISICAL_URL + "/secret/" + workspaceId, {
			headers: {
				Authorization: "Bearer " + credentials.password,
			},
		});
	} catch (err) {
		console.error("❌ Error: " + err.response.data.message);
		process.exit(1);
	}

	return response.data;
};

module.exports = {
	connectToWorkspace,
	getWorkspaceKeys,
	getSharedKey,
	uploadFile,
	uploadSecrets,
	getFile,
	getSecrets
};
