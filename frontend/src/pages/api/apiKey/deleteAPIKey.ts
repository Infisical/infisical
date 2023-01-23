import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  apiKeyId: string;
}

/**
 * This route revokes the API key with id [apiKeyId]
 * @param {object} obj
 * @param {string} obj.apiKeyId - id of the API key to delete
 * @returns
 */
const deleteAPIKey = ({ apiKeyId }: Props) =>
  SecurityClient.fetchCall(`/v2/api-key/${apiKeyId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log('Failed to delete API key');
    return undefined;
  });

export default deleteAPIKey;
