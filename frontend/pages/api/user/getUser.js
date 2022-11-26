import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route gets the information about a specific user.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getUser = (req, res) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/user", {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	}).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).user;
		} else {
			console.log("Failed to get user info");
		}
	});
};

export default getUser;
