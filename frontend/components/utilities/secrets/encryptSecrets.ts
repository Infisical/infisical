import getLatestFileKey from "~/pages/api/workspace/getLatestFileKey";

const crypto = require("crypto");
const {
  decryptAssymmetric,
  encryptSymmetric,
} = require("../cryptography/crypto");
const nacl = require("tweetnacl");
nacl.util = require("tweetnacl-util");


interface SecretDataProps {
  type: 'personal' | 'shared';
  pos: number;
  key: string;
  value: string;
  id: string;
  comment: string;
}

interface EncryptedSecretProps {
  id: string;
  createdAt: string;
  environment: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  type: "personal" | "shared";
}

/**
 * Encypt secrets before pushing the to the DB
 * @param {object} obj 
 * @param {object} obj.secretsToEncrypt - secrets that we want to encrypt
 * @param {object} obj.workspaceId - the id of a project in which we are encrypting secrets
 * @returns 
 */
const encryptSecrets = async ({ secretsToEncrypt, workspaceId, env }: { secretsToEncrypt: SecretDataProps[]; workspaceId: string; env: string; }) => {
  let secrets;
  try {
    const sharedKey = await getLatestFileKey({ workspaceId });

    const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

    let randomBytes: string;
    if (Object.keys(sharedKey).length > 0) {
      // case: a (shared) key exists for the workspace
      randomBytes = decryptAssymmetric({
        ciphertext: sharedKey.latestKey.encryptedKey,
        nonce: sharedKey.latestKey.nonce,
        publicKey: sharedKey.latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY,
      });
    } else {
      // case: a (shared) key does not exist for the workspace
      randomBytes = crypto.randomBytes(16).toString("hex");
    }
    
    secrets = secretsToEncrypt.map((secret) => {
      // encrypt key
      const {
        ciphertext: secretKeyCiphertext,
        iv: secretKeyIV,
        tag: secretKeyTag,
      } = encryptSymmetric({
        plaintext: secret.key,
        key: randomBytes,
      });

      // encrypt value
      const {
        ciphertext: secretValueCiphertext,
        iv: secretValueIV,
        tag: secretValueTag,
      } = encryptSymmetric({
        plaintext: secret.value,
        key: randomBytes,
      });

      // encrypt comment
      const {
        ciphertext: secretCommentCiphertext,
        iv: secretCommentIV,
        tag: secretCommentTag,
      } = encryptSymmetric({
        plaintext: secret.comment ?? '',
        key: randomBytes,
      });

      const result: EncryptedSecretProps = {
        id: secret.id,
        createdAt: '',
        environment: env,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        type: secret.type,
      };

      return result;
    });
  } catch (error) {
    console.log("Error while encrypting secrets");
  }

  return secrets;
  
}

export default encryptSecrets;
