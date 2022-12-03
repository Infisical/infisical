/**
 * This is the first step of the login process (pake)
 * @param {*} email
 * @param {*} clientPublicKey
 * @returns
 */
const login1 = (email, clientPublicKey) => {
  return fetch("/api/v1/auth/login1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      clientPublicKey,
    }),
  });
};

export default login1;
