import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  workspaceId: string;
  secrets: any;
  keys: string;
  environment: string;
}

/**
 * This function uploads the encrypted .env file
 * @param {object} obj
 * @param {string} obj.workspaceId
 * @param {} obj.secrets
 * @param {} obj.keys
 * @param {string} obj.environment
 * @returns
 */
const uploadSecrets = async ({ workspaceId, secrets, keys, environment }: Props) =>
  SecurityClient.fetchCall(`/v2/workspace/${workspaceId}/secrets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      secrets,
      keys,
      environment,
      channel: 'web'
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to push secrets');
    return undefined;
  });

export default uploadSecrets;
