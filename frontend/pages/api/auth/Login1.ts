interface Login1 {
  serverPublicKey: string;
  salt: string;
}

/**
 * This is the first step of the login process (pake)
 * @param {*} email
 * @param {*} clientPublicKey
 * @returns
 */
const login1 = async (email: string, clientPublicKey: string) => {
  const response = await fetch("/api/v1/auth/login1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      clientPublicKey,
    }),
  });
  // need precise error handling about the status code
  if (response?.status === 200) {
    const data = (await response.json()) as unknown as Login1;
    return data;
  }

  throw new Error("Wrong password");
};

export default login1;
