import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route gets service tokens for a specific user in a project
 * @param {*} param0
 * @returns
 */
const addServiceToken = ({
	name,
	workspaceId,
	environment,
	expiresIn,
	publicKey,
	encryptedKey,
	nonce,
}) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/service-token/", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			name,
			workspaceId,
			environment,
			expiresIn,
			publicKey,
			encryptedKey,
			nonce,
		}),
	}).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).token;
		} else {
			console.log("Failed to add service tokens");
		}
	});
};

export default addServiceToken;
