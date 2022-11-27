import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "~/const";

/**
 * This route lets us get the all the orgs of a certain user.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizations = (req, res) => {
  return SecurityClient.fetchCall(PATH + "/api/v1/organization", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }).then(async (res) => {
    if (res.status == 200) {
      return (await res.json()).organizations;
    } else {
      console.log("Failed to get orgs of a user");
    }
  });
};

export default getOrganizations;
