import { PATH } from "../../../const.js";

const token = async (req, res) => {
	return fetch(PATH + "/api/v1/auth/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		credentials: "include"
	})
	.then(async res => {
		if (res.status == 200) {
			return (await res.json()).token;
		} else {
			console.log('Getting a new token failed');
		}
	})
};

export default token;
