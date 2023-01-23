import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  integrationAuthId: string;
}

/**
 * This route deletes an integration authorization from a certain project
 * @param {*} integrationAuthId
 * @returns
 */
const deleteIntegrationAuth = ({ integrationAuthId }: Props) =>
  SecurityClient.fetchCall(`/v1/integration-auth/${integrationAuthId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).integrationAuth;
    }
    console.log('Failed to delete an integration authorization');
    return undefined;
  });

export default deleteIntegrationAuth;
