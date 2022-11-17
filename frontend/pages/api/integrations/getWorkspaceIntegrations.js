import SecurityClient from "../../../components/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route gets integrations of a certain project (Heroku, etc.)
 * @param {*} workspaceId
 * @returns
 */
const getWorkspaceIntegrations = ({ workspaceId }) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/workspace/" + workspaceId + "/integrations", {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	})
	.then(async res => {
		if (res.status == 200) {
			return (await res.json()).integrations;
		} else {
			console.log('Failed to get the project integrations');
		}
	})
};

export default getWorkspaceIntegrations;
