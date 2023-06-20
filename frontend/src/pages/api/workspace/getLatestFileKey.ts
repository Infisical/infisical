import { apiRequest } from "@app/config/request";

/**
 * Get the latest key pairs from a certain workspace
 * @param {string} workspaceId
 * @returns
 */
const getLatestFileKey = async ({ workspaceId }: { workspaceId: string }) => {
  const { data } = await apiRequest.get(`/api/v1/key/${workspaceId}/latest`);
  return data;
}

export default getLatestFileKey;
