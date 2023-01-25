import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  clientPublicKey: string;
}

/**
 * This is the first step of the change password process (pake)
 * @param {string} clientPublicKey
 * @returns
 */
const SRP1 = ({ clientPublicKey }: Props) =>
  SecurityClient.fetchCall('/v1/password/srp1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientPublicKey
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log('Failed to do the first step of SRP');
    return undefined;
  });

export default SRP1;
