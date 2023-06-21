import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route lets us get the environments that a certain user has acess to in a certain project
 * @param {string} workspaceId
 * @returns
 */
const getWorkspaceEnvironments = ({ workspaceId }: { workspaceId: string }) =>
  SecurityClient.fetchCall(`/api/v2/workspace/${workspaceId}/environments`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).accessibleEnvironments;
    }
    console.log("Failed to get accessible environments");
    return undefined;
  });

export default getWorkspaceEnvironments;
