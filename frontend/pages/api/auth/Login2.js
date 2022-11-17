import { PATH } from "../../../const";

/**
 * This is the second step of the login process
 * @param {*} email
 * @param {*} clientPublicKey
 * @returns
 */
const login2 = (email, clientProof) => {
	return fetch(PATH + "/api/v1/auth/login2", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			email: email,
			clientProof,
		}),
		credentials: "include"
	})
	.then(res => {
		if (res.status == 200) {
			console.log("User logged in", res);
			return res;
		} else {
			console.log("Failed to log in");
		}
	})
};

export default login2;
