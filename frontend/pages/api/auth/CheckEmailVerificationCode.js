/**
 * This route check the verification code from the email that user just recieved
 * @param {*} email
 * @param {*} code
 * @returns
 */
const checkEmailVerificationCode = (email, code) => {
  return fetch("/api/v1/signup/email/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      code: code,
    }),
  });
};

export default checkEmailVerificationCode;
