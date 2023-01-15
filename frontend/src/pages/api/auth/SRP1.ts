import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  clientPublicKey: string;
}

/**
 * This is the first step of the change password process (pake)
 * @param {string} clientPublicKey
 * @returns
 */
const SRP1 = ({ clientPublicKey }: Props) => {
  return SecurityClient.fetchCall('/api/v1/password/srp1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      clientPublicKey
    })
  }).then(async (res) => {
    if (res && res.status == 200) {
      return await res.json();
    } else {
      console.log('Failed to do the first step of SRP');
    }
  });
};

export default SRP1;
