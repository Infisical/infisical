interface Login2Response {
  mfaEnabled: boolean;
  token: string;
  encryptionVersion?: number;
  protectedKey?: string;
  protectedKeyIV?: string;
  protectedKeyTag?: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  iv?: string;
  tag?: string;
}

/**
 * This is the second step of the login process
 * @param {*} email
 * @param {*} clientPublicKey
 * @returns
 */
const login2 = async (loginDetails: {
  email: string;
  clientProof: string;
  userId?: string;
}) => {
  const response = await fetch('/api/v2/auth/login2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(loginDetails),
    credentials: 'include'
  });
  // need precise error handling about the status code
  if (response.status === 200) {
    const data = (await response.json()) as unknown as Login2Response;
    return data;
  }

  throw new Error('Password verification failed');
};

export default login2;
