interface Props {
  email: string;
  token: string;
}

/**
 * This is to confirm email verification during signup flow
 * @param {object} obj
 * @param {object} obj.email - email of a user that is trying to recover access to their account
 * @param {object} obj.code - token that a use received via the magic link
 * @returns
 */
const confirmEmailSignUp = async ({ email, token }: Props) => {
  const response = await fetch("/api/v1/signup/email/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      token
    })
  });
  if (response?.status === 200) {
    return response;
  }

  throw new Error("Something went wrong during email verification on password reset.");
};

export default confirmEmailSignUp;
