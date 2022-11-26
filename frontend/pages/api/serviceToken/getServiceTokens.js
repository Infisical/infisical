import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route gets service tokens for a specific user in a project
 * @param {*} param0
 * @returns
 */
const getServiceTokens = ({ workspaceId }) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/workspace/" + workspaceId + "/service-tokens",
		{
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		}
	).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).serviceTokens;
		} else {
			console.log("Failed to get service tokens");
		}
	});
};

export default getServiceTokens;
