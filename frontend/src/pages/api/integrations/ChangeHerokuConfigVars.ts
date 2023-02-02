import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  integrationId: string;
  key: { encryptedKey: any; nonce: any };
  secrets: {
    ciphertextKey: any;
    ivKey: any;
    tagKey: any;
    hashKey: any;
    ciphertextValue: any;
    ivValue: any;
    tagValue: any;
    hashValue: any;
    type: string;
  }[];
}

const changeHerokuConfigVars = ({ integrationId, key, secrets }: Props) =>
  SecurityClient.fetchCall(`/api/v1/integration/${integrationId}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      key,
      secrets
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to sync secrets to Heroku');
    return undefined;
  });

export default changeHerokuConfigVars;
