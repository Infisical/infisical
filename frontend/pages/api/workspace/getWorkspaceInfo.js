import { PATH } from "~/const";
import SecurityClient from "~/utilities/SecurityClient";

/**
 * This route lets us get the information of a certain project.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getWorkspaceInfo = (req, res) => {
  return SecurityClient.fetchCall(
    PATH + "/api/v1/workspace/" + req.workspaceId,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return (await res.json()).workspace;
    } else {
      console.log("Failed to get project info");
    }
  });
};

export default getWorkspaceInfo;
