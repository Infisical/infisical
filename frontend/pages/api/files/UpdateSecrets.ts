import SecurityClient from '~/utilities/SecurityClient';

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
  type: "personal" | "shared";
}

/**
 * This function updates certain secrets in a certain project
 * @param {object} obj
 * @param {EncryptedSecretProps[]} obj.secrets - the ids of secrets that we want to update
 * @returns
 */
const updateSecrets = async ({ secrets }: { secrets: EncryptedSecretProps[] }) => {
  return SecurityClient.fetchCall('/api/v2/secrets', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        secrets
      })
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return await res.json();
    } else {
      console.log('Failed to update certain project secrets');
    }
  });
};

export default updateSecrets;
