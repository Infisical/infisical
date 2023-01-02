import SecurityClient from '~/utilities/SecurityClient';


interface workspaceProps {
  workspaceId: string; 
  offset: number;
  limit: number;
  userId: string;
  actionNames: string;
}

/**
 * This function fetches the activity logs for a certain project
 * @param {object} obj
 * @param {string} obj.workspaceId - workspace id for which we are trying to get project log 
 * @param {object} obj.offset - teh starting point of logs that we want to pull
 * @param {object} obj.limit - how many logs will we output
 * @param {object} obj.userId - optional userId filter - will only query logs for that user
 * @param {string} obj.actionNames - optional actionNames filter - will only query logs for those actions
 * @returns
 */
const getProjectLogs = async ({ workspaceId, offset, limit, userId, actionNames }: workspaceProps) => {
  let payload;
  if (userId != "" && actionNames != '') {
    payload = {
      offset: String(offset),
      limit: String(limit),
      userId: JSON.stringify(userId),
      actionNames: actionNames
    }
  } else if (userId != "") {
    payload = {
      offset: String(offset),
      limit: String(limit),
      userId: JSON.stringify(userId)
    }
  } else if (actionNames != "") {
    payload = {
      offset: String(offset),
      limit: String(limit),
      actionNames: actionNames
    }
  } else {
    payload = {
      offset: String(offset),
      limit: String(limit)
    }
  }
  
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/logs?' +
      new URLSearchParams(payload),
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
