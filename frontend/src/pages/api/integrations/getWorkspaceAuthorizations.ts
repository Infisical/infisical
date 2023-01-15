import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  workspaceId: string;
}

/**
 * This route gets authorizations of a certain project (Heroku, etc.)
 * @param {*} workspaceId
 * @returns
 */
const getWorkspaceAuthorizations = ({ workspaceId }: Props) => {
  return SecurityClient.fetchCall(
    '/api/v1/workspace/' + workspaceId + '/authorizations',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).authorizations;
    } else {
      console.log('Failed to get project authorizations');
    }
  });
};

export default getWorkspaceAuthorizations;
