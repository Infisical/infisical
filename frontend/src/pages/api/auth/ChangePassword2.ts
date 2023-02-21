import { apiRequest } from "@app/config/request";

interface Props {
  clientProof: string;
  protectedKey: string;
  protectedKeyIV: string;
  protectedKeyTag: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIV: string;
  encryptedPrivateKeyTag: string;
  salt: string;
  verifier: string;
}

/**
 * This is the second step of the change password process (pake)
 * @param {*} clientPublicKey
 * @returns
 */
const changePassword2 = async ({
  clientProof,
  protectedKey,
  protectedKeyIV,
  protectedKeyTag,
  encryptedPrivateKey, 
  encryptedPrivateKeyIV, 
  encryptedPrivateKeyTag, 
  salt, 
  verifier
}: Props) => {
  const { data } = await apiRequest.post('/api/v1/password/change-password', {
    clientProof,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    salt,
    verifier
  });
  
  return data;
}

export default changePassword2;
