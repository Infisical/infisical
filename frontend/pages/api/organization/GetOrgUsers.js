import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route lets us get all the users in an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizationUsers = (req, res) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/organization/" + req.orgId + "/users",
		{
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		}
	).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).users;
		} else {
			console.log("Failed to get org users");
		}
	});
};

export default getOrganizationUsers;
