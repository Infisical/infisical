import SecurityClient from "~/utilities/SecurityClient";

/**
 * This route lets us get the public keys of everyone in your workspace.
 * @param {string} workspaceId
 * @returns
 */
const getWorkspaceKeys = ({ workspaceId }: { workspaceId: string; }) => {
  return SecurityClient.fetchCall(
    "/api/v1/workspace/" + workspaceId + "/keys",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  ).then(async (res) => {
    if (res?.status == 200) {
      return (await res.json()).publicKeys;
    } else {
      console.log("Failed to get the public keys of everyone in the workspace");
    }
  });
};

export default getWorkspaceKeys;
