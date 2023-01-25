import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  integrationId: string;
}

/**
 * This route deletes an integration from a certain project
 * @param {*} integrationId
 * @returns
 */
const deleteIntegration = ({ integrationId }: Props) =>
  SecurityClient.fetchCall(`/v1/integration/${integrationId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).integration;
    }
    console.log('Failed to delete an integration');
    return undefined;
  });

export default deleteIntegration;
