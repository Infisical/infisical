import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route gets service tokens for a specific user in a project
 * @param {*} param0
 * @returns
 */
const getServiceTokens = ({ workspaceId }: { workspaceId: string }) =>
  SecurityClient.fetchCall(`/api/v2/workspace/${workspaceId}/service-token-data`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).serviceTokenData;
    }
    console.log("Failed to get service tokens");
    return undefined;
  });

export default getServiceTokens;
