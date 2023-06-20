import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route lets us get info about a certain org
 * @param {string} orgId - the organization ID
 * @returns
 */
const getOrganization = ({ orgId }: { orgId: string }) =>
  SecurityClient.fetchCall(`/api/v1/organization/${orgId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).organization;
    }
    console.log("Failed to get org info");
    return undefined;
  });

export default getOrganization;
