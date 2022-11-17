import SecurityClient from "../../../components/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * Get the latest key pairs from a certain workspace
 * @param {*} workspaceId
 * @returns
 */
const getLatestFileKey = (workspaceId) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/key/" + workspaceId + "/latest", {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	})
	.then(async res => {
		if (res.status == 200) {
			return (await res.json());
		} else {
			console.log('Failed to get the latest key pairs for a certain project');
		}
	})
};

export default getLatestFileKey;
