import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route lets us get the public keys of everyone in your workspace.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getWorkspaces = (req, res) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/workspace", {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	}).then(async (res) => {
		if (res.status == 200) {
			return (await res.json()).workspaces;
		} else {
			console.log("Failed to get projects");
		}
	});
};

export default getWorkspaces;
