import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "~/const";

/**
 * This route lets us get the public keys of everyone in your workspace.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getWorkspaceKeys = (req, res) => {
  return SecurityClient.fetchCall(
    PATH + "/api/v1/workspace/" + req.workspaceId + "/keys",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return (await res.json()).publicKeys;
    } else {
      console.log("Failed to get the public keys of everyone in the workspace");
    }
  });
};

export default getWorkspaceKeys;
