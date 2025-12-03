/**
 * Verify that a credential ID belongs to a user
 */
export const verifyCredentialOwnership = (userId: string, credentialUserId: string): boolean => {
  return userId === credentialUserId;
};
