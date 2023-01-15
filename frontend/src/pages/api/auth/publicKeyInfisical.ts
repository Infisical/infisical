const publicKeyInfisical = () => {
  return fetch('/api/v1/key/publicKey/infisical', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

export default publicKeyInfisical;
