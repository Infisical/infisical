/**
 * This is the route that get an encrypted private key (will be decrypted with a backup key)
 * @param {object} obj
 * @param {object} obj.verificationToken - this is the token that confirms that a user is the right one
 * @returns
 */
const getBackupEncryptedPrivateKey = ({
  verificationToken
}: {
  verificationToken: string;
}) => {
  return fetch('/api/v1/password/backup-private-key', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + verificationToken
    }
  }).then(async (res) => {
    if (res?.status !== 200) {
      console.log('Failed to get the backup key');
    }
    return (await res?.json())?.backupPrivateKey;
  });
};

export default getBackupEncryptedPrivateKey;
