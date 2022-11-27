import { PATH } from "~/const";
import SecurityClient from "~/utilities/SecurityClient";

/**
 * This route lets us rename a certain org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const renameOrg = (orgId, newOrgName) => {
  return SecurityClient.fetchCall(
    PATH + "/api/v1/organization/" + orgId + "/name",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: newOrgName,
      }),
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return res;
    } else {
      console.log("Failed to rename an organization");
    }
  });
};

export default renameOrg;
