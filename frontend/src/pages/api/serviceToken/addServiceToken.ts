import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  name: string;
  workspaceId: string;
  environment: string;
  expiresIn: number;
  encryptedKey: string;
  iv: string;
  tag: string;
}

/**
 * This route adds a service token for a specific user in a project
 * @param {object} obj
 * @param {string} obj.name - name of the service token
 * @param {string} obj.workspaceId - workspace for which we are issuing the token
 * @param {string} obj.environment - environment for which we are issuing the token
 * @param {string} obj.expiresIn - how soon the service token expires in ms
 * @param {string} obj.encryptedKey - encrypted project key through random symmetric encryption
 * @param {string} obj.iv - obtained through symmetric encryption
 * @param {string} obj.tag - obtained through symmetric encryption
 * @returns
 */
const addServiceToken = ({
  name,
  workspaceId,
  environment,
  expiresIn,
  encryptedKey,
  iv,
  tag
}: Props) =>
  SecurityClient.fetchCall('/api/v2/service-token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      workspaceId,
      environment,
      expiresIn,
      encryptedKey,
      iv,
      tag
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log('Failed to add service tokens');
    return undefined;
  });

export default addServiceToken;
