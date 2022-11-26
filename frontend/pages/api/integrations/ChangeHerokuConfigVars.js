import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

const changeHerokuConfigVars = ({ integrationId, key, secrets }) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/integration/" + integrationId + "/sync",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				key,
				secrets,
			}),
		}
	).then(async (res) => {
		if (res.status == 200) {
			return res;
		} else {
			console.log("Failed to sync secrets to Heroku");
		}
	});
};

export default changeHerokuConfigVars;
