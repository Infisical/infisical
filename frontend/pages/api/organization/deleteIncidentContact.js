import SecurityClient from "~/utilities/SecurityClient";
import { PATH } from "../../../const";

/**
 * This route deletes an incident Contact from a certain organization
 * @param {*} param0
 * @returns
 */
const deleteIncidentContact = (organizaionId, email) => {
	return SecurityClient.fetchCall(
		PATH + "/api/v1/organization/" + organizaionId + "/incidentContactOrg",
		{
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: email,
			}),
		}
	).then(async (res) => {
		if (res.status == 200) {
			return res;
		} else {
			console.log("Failed to delete an incident contact");
		}
	});
};

export default deleteIncidentContact;
