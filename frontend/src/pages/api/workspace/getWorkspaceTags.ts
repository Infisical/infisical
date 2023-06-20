import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route lets us get the tags for a certain project
 * @param {string} workspaceId
 * @returns
 */
const getWorkspaceTags = ({ workspaceId }: { workspaceId: string }) =>
  SecurityClient.fetchCall(`/api/v2/workspace/${workspaceId}/tags`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).workspaceTags;
    }
    console.log("Failed to get the tags available in a certain project");
    return undefined;
  });

export default getWorkspaceTags;
