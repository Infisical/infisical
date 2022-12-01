import SecurityClient from "~/utilities/SecurityClient";

/**
 * This route lets us get all the users in the workspace.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getWorkspaceUsers = (req, res) => {
  return SecurityClient.fetchCall(
    "/api/v1/workspace/" + req.workspaceId + "/users",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return (await res.json()).users;
    } else {
      console.log("Failed to get Project Users");
    }
  });
};

export default getWorkspaceUsers;
