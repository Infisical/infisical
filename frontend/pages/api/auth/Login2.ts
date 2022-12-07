interface Login2Response {
  encryptedPrivateKey: string;
  iv: string;
  publicKey: string;
  tag: string;
  token: string;
}

/**
 * This is the second step of the login process
 * @param {*} email
 * @param {*} clientPublicKey
 * @returns
 */
const login2 = async (email: string, clientProof: string) => {
  const response = await fetch("/api/v1/auth/login2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      clientProof,
    }),
    credentials: "include",
  });
  // need precise error handling about the status code
  if (response.status == 200) {
    const data = (await response.json()) as unknown as Login2Response;
    return data;
  }

  throw new Error("Password verification failed");
};

export default login2;
