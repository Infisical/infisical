import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "../../../const";

/**
 * This route registers a certain action for a user
 * @param {*} action
 * @returns
 */
const registerUserAction = ({ action }) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/user-action", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			action,
		}),
	}).then(async (res) => {
		if (res.status == 200) {
			return res;
		} else {
			console.log("Failed to register a user action");
		}
	});
};

export default registerUserAction;
