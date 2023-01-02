import SecurityClient from '~/utilities/SecurityClient';


interface workspaceProps {
  workspaceId: string; 
  offset: number;
  limit: number;
  filters: object;
}

/**
 * This function fetches the activity logs for a certain project
 * @param {object} obj
 * @param {string} obj.workspaceId - workspace id for which we are trying to get project log 
 * @param {object} obj.offset - teh starting point of logs that we want to pull
 * @param {object} obj.limit - how many logs will we output
 * @param {object} obj.filters
 * @returns
 */
const getProjectLogs = async ({ workspaceId, offset, limit, filters }: workspaceProps) => {
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/logs?' +
      new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        filters: JSON.stringify(filters)
      }),
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).logs;
    } else {
      console.log('Failed to get project logs');
    }
  });
};

export default getProjectLogs;
