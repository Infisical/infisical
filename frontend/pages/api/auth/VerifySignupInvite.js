import { PATH } from "../../../const";

/**
 * This route verifies the signup invite link
 * @param {*} email
 * @param {*} code
 * @returns
 */
const verifySignupInvite = ({email, code}) => {
	return fetch(PATH + "/api/v1/invite-org/verify", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			email,
			code,
		}),
	});
};

export default verifySignupInvite;
