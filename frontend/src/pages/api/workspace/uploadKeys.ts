import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route uplods the keys in an encrypted format.
 * @param {*} workspaceId
 * @param {*} userId
 * @param {*} encryptedKey
 * @param {*} nonce
 * @returns
 */
const uploadKeys = (
  workspaceId: string,
  userId: string,
  encryptedKey: string,
  nonce: string
) => {
  return SecurityClient.fetchCall('/api/v1/key/' + workspaceId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      key: {
        userId: userId,
        encryptedKey: encryptedKey,
        nonce: nonce
      }
    })
  }).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to upload keys for a new user');
    }
  });
};

export default uploadKeys;
