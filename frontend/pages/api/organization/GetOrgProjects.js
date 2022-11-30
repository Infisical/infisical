import SecurityClient from "~/utilities/SecurityClient";

/**
 * This route lets us get all the users in an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizationProjects = (req, res) => {
  return SecurityClient.fetchCall(
    "/api/organization/" + req.orgId + "/workspaces",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return (await res.json()).workspaces;
    } else {
      console.log("Failed to get projects for an org");
    }
  });
};

export default getOrganizationProjects;
