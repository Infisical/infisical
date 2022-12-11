/**
 * This route send the verification email to the user's email (contains a 6-digit verification code)
 * @param {*} email
 */
const sendVerificationEmail = (email: string) => {
  fetch('/api/v1/signup/email/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email
    })
  });
};

export default sendVerificationEmail;
