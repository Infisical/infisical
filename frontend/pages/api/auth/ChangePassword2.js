import SecurityClient from "../../../components/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This is the second step of the change password process (pake)
 * @param {*} clientPublicKey
 * @returns
 */
const changePassword2 = ({encryptedPrivateKey, iv, tag, salt, verifier, clientProof}) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/password/change-password", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			"clientProof": clientProof,
			"encryptedPrivateKey": encryptedPrivateKey,
			"iv": iv,
			"tag": tag,
			"salt": salt,
			"verifier": verifier
		}),
	})
	.then(async res => {
		if (res.status == 200) {
			return res;
		} else {
			console.log('Failed to change the password');
		}
	})
};

export default changePassword2;
