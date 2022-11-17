import SecurityClient from "../../../components/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This function sends an email invite to a user to join an org
 * @param {*} email
 * @param {*} orgId
 * @returns
 */
const addUserToOrg = (email, orgId) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/invite-org/signup", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			inviteeEmail: email,
			organizationId: orgId,
		}),
	})
	.then(async res => {
		if (res.status == 200) {
			return res;
		} else {
			console.log('Failed to add a user to an org');
		}
	})
};

export default addUserToOrg;
