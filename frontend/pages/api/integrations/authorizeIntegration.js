import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This is the first step of the change password process (pake)
 * @param {*} clientPublicKey
 * @returns
 */
const AuthorizeIntegration = ({ workspaceId, code, integration }) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/integration-auth/oauth-token",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				workspaceId,
				code,
				integration,
			}),
		}
	).then(async (res) => {
		if (res.status == 200) {
			return res;
		} else {
			console.log("Failed to authorize the integration");
		}
	});
};

export default AuthorizeIntegration;
