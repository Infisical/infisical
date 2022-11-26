import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "../../../const";

/**
 * This route deletes an integration from a certain project
 * @param {*} integrationId
 * @returns
 */
const deleteIntegration = ({ integrationId }) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/integration/" + integrationId,
		{
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
		}
	).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).workspace;
		} else {
			console.log("Failed to delete an integration");
		}
	});
};

export default deleteIntegration;
