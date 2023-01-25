import { BACKEND_API_URL } from '../../../components/utilities/config';

const publicKeyInfisical = () =>
  fetch(`${BACKEND_API_URL}/v1/key/publicKey/infisical`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

export default publicKeyInfisical;
