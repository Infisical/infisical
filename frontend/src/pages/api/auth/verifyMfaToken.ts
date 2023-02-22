import { apiRequest } from "@app/config/request";

/**
 * Verify MFA token [mfaToken] for user with email [email]
 * @param {object} obj
 * @param {string} obj.email - email of user
 * @param {string} obj.mfaToken - MFA cod/token to verify
 * @returns
 */
const verifyMfaToken = async ({
    email, 
    mfaToken
}: {
    email: string;
    mfaToken: string;
}) => {
  const { data } = await apiRequest.post('/api/v2/auth/mfa/verify', {
    email,
    mfaToken
  });  
  
  return data;
}

export default verifyMfaToken;
