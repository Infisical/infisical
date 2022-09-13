const axios = require("axios");
const netrc = require("netrc-rw");
const { INFISICAL_URL, LOGIN_HOST } = require("./variables");
const { getCredentials } = require("./utilities/auth");

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
		console.log(err);
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
			INFISICAL_URL + "/key/" + workspaceId + "/latest",
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

	return response.data?.latestKey;
};

const uploadSecrets = async ({ workspaceId, secrets, keys, environment }) => {
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
				keys,
				environment,
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

const getSecrets = async ({ workspaceId, environment }) => {
	const credentials = getCredentials({
		host: LOGIN_HOST,
	});

	let response;
	try {
		response = await axios.get(INFISICAL_URL + "/secret/" + workspaceId, {
			headers: {
				Authorization: "Bearer " + credentials.password,
			},
			params: {
				environment,
			},
		});
	} catch (err) {
		console.error("❌ Error: " + err.response.data.message);
		process.exit(1);
	}

	return response.data;
};

const checkConnect = async ({ workspaceId }) => {
	let response;
	try {
		const credentials = netrc.host(LOGIN_HOST);
		response = await axios.get(
			INFISICAL_URL + "/membership/" + workspaceId + "/connect",
			{
				headers: {
					Authorization: "Bearer " + credentials.password,
				},
			}
		);
	} catch (err) {
		return false;
	}

	return true;
};

const checkAuth = async () => {
	try {
		const credentials = netrc.host(LOGIN_HOST);
		await axios.post(
			INFISICAL_URL + "/checkAuth",
			{},
			{
				headers: {
					Authorization: "Bearer " + credentials.password,
				},
			}
		);
	} catch (err) {
		return false;
	}

	return true;
};

module.exports = {
	checkConnect,
	getWorkspaceKeys,
	getSharedKey,
	uploadSecrets,
	getSecrets,
	checkAuth,
};
