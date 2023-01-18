import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us get the information of a certain project.
 * @param {*} projectId - project ID (we renamed workspaces to projects in the app)
 * @returns
 */
const getProjectInfo = ({ projectId }: { projectId: string }) =>
  SecurityClient.fetchCall(`/api/v1/workspace/${projectId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).workspace;
    }
    console.log('Failed to get project info');
    return undefined;
  });

export default getProjectInfo;
