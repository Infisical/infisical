import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  integrationId: string;
}

/**
 * This route deletes an integration from a certain project
 * @param {*} integrationId
 * @returns
 */
const deleteIntegration = ({ integrationId }: Props) => {
  return SecurityClient.fetchCall('/api/v1/integration/' + integrationId, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).workspace;
    } else {
      console.log('Failed to delete an integration');
    }
  });
};

export default deleteIntegration;
