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
 * This function adds secrets to a certain project
 * @param {object} obj
 * @param {EncryptedSecretProps} obj.secrets - the ids of secrets that we want to add
 * @param {string} obj.env - the environment to which we are adding secrets
 * @param {string} obj.workspaceId - the project to which we are adding secrets
 * @returns
 */
const addSecrets = async ({ secrets, env, workspaceId }: { secrets: EncryptedSecretProps[]; env: string; workspaceId: string; }) => {
  return SecurityClient.fetchCall('/api/v2/secrets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        environment: env,
        workspaceId,
        secrets
      })
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return await res.json();
    } else {
      console.log('Failed to add certain project secrets');
    }
  });
};

export default addSecrets;
