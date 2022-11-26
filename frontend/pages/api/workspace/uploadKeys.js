import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route uplods the keys in an encrypted format.
 * @param {*} workspaceId
 * @param {*} userId
 * @param {*} encryptedKey
 * @param {*} nonce
 * @returns
 */
const uploadKeys = (workspaceId, userId, encryptedKey, nonce) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/key/" + workspaceId, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			key: {
				userId: userId,
				encryptedKey: encryptedKey,
				nonce: nonce,
			},
		}),
	}).then(async (res) => {
		if (res.status == 200) {
			return res;
		} else {
			console.log("Failed to upload keys for a new user");
		}
	});
};

export default uploadKeys;
