import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route lets us get the information of a certain project.
 * @param {*} projectId - project ID (we renamed workspaces to projects in the app)
 * @returns
 */
const getProjectInfo = ({ projectId }: { projectId: string }) => {
  return SecurityClient.fetchCall('/api/v1/workspace/' + projectId, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status == 200) {
      return (await res.json()).workspace;
    } else {
      console.log('Failed to get project info');
    }
  });
};

export default getProjectInfo;
