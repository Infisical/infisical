import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route lets us get all the project memebrships of users in an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */

const getOrganizationProjectMemberships = (req: { orgId: string }) =>
  SecurityClient.fetchCall(`/api/v1/organization/${req.orgId}/workspace-memberships`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to get project memberships for users in an org");
    return undefined;
  });

export default getOrganizationProjectMemberships;
