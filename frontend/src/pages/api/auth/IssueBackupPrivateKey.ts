import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  salt: string;
  verifier: string;
  clientProof: string;
}

/**
 * This is the route that issues a backup private key that will afterwards be added into a pdf
 * @param {object} obj
 * @param {string} obj.encryptedPrivateKey
 * @param {string} obj.iv
 * @param {string} obj.tag
 * @param {string} obj.salt
 * @param {string} obj.verifier
 * @param {string} obj.clientProof
 * @returns
 */
const issueBackupPrivateKey = ({
  encryptedPrivateKey,
  iv,
  tag,
  salt,
  verifier,
  clientProof
}: Props) =>
  SecurityClient.fetchCall('/api/v1/password/backup-private-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientProof,
      encryptedPrivateKey,
      iv,
      tag,
      salt,
      verifier
    })
  }).then((res) => {
    if (res?.status !== 200) {
      console.log('Failed to issue the backup key');
    }
    return res;
  });

export default issueBackupPrivateKey;
