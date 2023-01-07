import SecurityClient from '~/utilities/SecurityClient';


interface workspaceProps {
  workspaceId: string; 
}

/**
 * This function fetches the count of secret snapshots for a certain project
 * @param {object} obj
 * @param {string} obj.workspaceId - project id for which we are trying to get project secret snapshots 
 * @returns
 */
const getProjectSercetSnapshotsCount = async ({ workspaceId }: workspaceProps) => {
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/secret-snapshots/count', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).count;
    } else {
      console.log('Failed to get the count of project secret snapshots');
    }
  });
};

export default getProjectSercetSnapshotsCount;
