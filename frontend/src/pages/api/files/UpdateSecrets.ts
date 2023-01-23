import SecurityClient from '@app/components/utilities/SecurityClient';

interface EncryptedSecretProps {
  id: string;
  createdAt: string;
  environment: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  type: 'personal' | 'shared';
}

/**
 * This function updates certain secrets in a certain project
 * @param {object} obj
 * @param {EncryptedSecretProps[]} obj.secrets - the ids of secrets that we want to update
 * @returns
 */
const updateSecrets = async ({ secrets }: { secrets: EncryptedSecretProps[] }) =>
  SecurityClient.fetchCall('/v2/secrets', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      secrets
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log('Failed to update certain project secrets');
    return undefined;
  });

export default updateSecrets;
