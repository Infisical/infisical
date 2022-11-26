import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This is the first step of the change password process (pake)
 * @param {*} clientPublicKey
 * @returns
 */
const SRP1 = ({ clientPublicKey }) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/password/srp1", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			clientPublicKey,
		}),
	}).then(async (res) => {
		if (res.status == 200) {
			return await res.json();
		} else {
			console.log("Failed to do the first step of SRP");
		}
	});
};

export default SRP1;
