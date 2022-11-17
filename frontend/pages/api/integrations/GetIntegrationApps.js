import SecurityClient from "../../../components/utilities/SecurityClient";
import { PATH } from "../../../const";

const getIntegrationApps = ({ integrationAuthId }) => {
	return SecurityClient.fetchCall(PATH + "/api/v1/integration-auth/" + integrationAuthId + "/apps", {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	})
	.then(async res => {
		if (res.status == 200) {
			return (await res.json()).apps;
		} else {
			console.log('Failed to get available apps for an integration');
		}
	})
};

export default getIntegrationApps;
