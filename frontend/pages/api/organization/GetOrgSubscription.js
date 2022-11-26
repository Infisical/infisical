import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route lets us get the current subscription of an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizationSubscriptions = (req, res) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/organization/" + req.orgId + "/subscriptions",
		{
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		}
	).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).subscriptions;
		} else {
			console.log("Failed to get org subscriptions");
		}
	});
};

export default getOrganizationSubscriptions;
