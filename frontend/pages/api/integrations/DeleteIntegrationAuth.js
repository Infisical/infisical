import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "../../../const";

/**
 * This route deletes an integration authorization from a certain project
 * @param {*} integrationAuthId
 * @returns
 */
const deleteIntegrationAuth = ({ integrationAuthId }) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/integration-auth/" + integrationAuthId,
		{
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
		}
	).then(async (res) => {
		if (res.status == 200) {
			return res;
		} else {
			console.log("Failed to delete an integration authorization");
		}
	});
};

export default deleteIntegrationAuth;
