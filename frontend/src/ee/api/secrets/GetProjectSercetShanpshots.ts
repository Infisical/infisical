import SecurityClient from "@app/components/utilities/SecurityClient";

interface WorkspaceProps {
  workspaceId: string;
  offset: number;
  limit: number;
}

/**
 * This function fetches the secret snapshots for a certain project
 * @param {object} obj
 * @param {string} obj.workspaceId - project id for which we are trying to get project secret snapshots
 * @param {object} obj.offset - teh starting point of snapshots that we want to pull
 * @param {object} obj.limit - how many snapshots will we output
 * @returns
 */
const getProjectSecretShanpshots = async ({ workspaceId, offset, limit }: WorkspaceProps) =>
  SecurityClient.fetchCall(
    `/api/v1/workspace/${workspaceId}/secret-snapshots?${new URLSearchParams({
      offset: String(offset),
      limit: String(limit)
    })}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    }
  ).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).secretSnapshots;
    }
    console.log("Failed to get project secret snapshots");
    return undefined;
  });

export default getProjectSecretShanpshots;
