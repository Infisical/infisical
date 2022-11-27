import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "~/const";

/**
 * This route lets us get info about a certain org
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganization = (req, res) => {
  return SecurityClient.fetchCall(PATH + "/api/v1/organization/" + req.orgId, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }).then(async (res) => {
    if (res.status == 200) {
      return (await res.json()).organization;
    } else {
      console.log("Failed to get org info");
    }
  });
};

export default getOrganization;
