import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * Get the latest key pairs from a certain workspace
 * @param {string} workspaceId
 * @returns
 */
const getLatestFileKey = ({ workspaceId }: { workspaceId: string }) =>
  SecurityClient.fetchCall(`/api/v1/key/${workspaceId}/latest`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return res.json();
    }
    console.log('Failed to get the latest key pairs for a certain project');
    return undefined;
  });

export default getLatestFileKey;
