import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "../../../const";

/**
 * This route lets us get all the projects of a certain user in an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizationUserProjects = (req, res) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/organization/" + req.orgId + "/my-workspaces",
		{
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		}
	).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).workspaces;
		} else {
			console.log("Failed to get projects of a user in an org");
		}
	});
};

export default getOrganizationUserProjects;
