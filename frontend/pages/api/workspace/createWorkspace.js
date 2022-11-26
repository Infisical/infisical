import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route creates a new workspace for a user.
 * @param {*} workspaceName
 * @returns
 */
const createWorkspace = (workspaceName, organizationId) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/workspace", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			workspaceName: workspaceName,
			organizationId: organizationId,
		}),
	}).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).workspace;
		} else {
			console.log("Failed to create a project");
		}
	});
};

export default createWorkspace;
