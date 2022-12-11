import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  integrationAuthId: string;
}

/**
 * This route deletes an integration authorization from a certain project
 * @param {*} integrationAuthId
 * @returns
 */
const deleteIntegrationAuth = ({ integrationAuthId }: Props) => {
  return SecurityClient.fetchCall(
    '/api/v1/integration-auth/' + integrationAuthId,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to delete an integration authorization');
    }
  });
};

export default deleteIntegrationAuth;
