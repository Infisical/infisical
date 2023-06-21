import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route add an incident contact email to a certain organization
 * @param {*} param0
 * @returns
 */
const addIncidentContact = (organizationId: string, email: string) =>
  SecurityClient.fetchCall(`/api/v1/organization/${organizationId}/incidentContactOrg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log("Failed to add an incident contact");
    return undefined;
  });

export default addIncidentContact;
