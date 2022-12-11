import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  workspaceId: string;
}

/**
 * This route gets integrations of a certain project (Heroku, etc.)
 * @param {*} workspaceId
 * @returns
 */
const getWorkspaceIntegrations = ({ workspaceId }: Props) => {
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/integrations',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).integrations;
    } else {
      console.log('Failed to get the project integrations');
    }
  });
};

export default getWorkspaceIntegrations;
