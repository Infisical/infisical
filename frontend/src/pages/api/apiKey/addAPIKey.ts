import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  name: string;
  expiresIn: number;
}

/**
 * This route adds an API key for the user
 * @param {object} obj
 * @param {string} obj.name - name of the API key
 * @param {string} obj.expiresIn - how soon the API key expires in ms
 * @returns
 */
const addAPIKey = ({ name, expiresIn }: Props) =>
  SecurityClient.fetchCall('/api/v2/api-key/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      expiresIn
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log('Failed to add API key');
    return undefined;
  });

export default addAPIKey;
