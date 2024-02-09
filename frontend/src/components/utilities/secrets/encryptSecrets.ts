import crypto from "crypto";

import { SecretDataProps, Tag } from "public/data/frequentInterfaces";

import { fetchUserWsKey } from "@app/hooks/api/keys/queries";

import { decryptAssymmetric, encryptSymmetric } from "../cryptography/crypto";

interface EncryptedSecretProps {
  id: string;
  createdAt: string;
  environment: string;
  secretName: string;
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
  tags: Tag[];
}

/**
 * Encypt secrets before pushing the to the DB
 * @param {object} obj
 * @param {object} obj.secretsToEncrypt - secrets that we want to encrypt
 * @param {object} obj.workspaceId - the id of a project in which we are encrypting secrets
 * @returns
 */
const encryptSecrets = async ({
  secretsToEncrypt,
  workspaceId,
  env
}: {
  secretsToEncrypt: SecretDataProps[];
  workspaceId: string;
  env: string;
}) => {
  let secrets;
  try {
    // const sharedKey = await getLatestFileKey({ workspaceId });
    const wsKey = await fetchUserWsKey(workspaceId);

    const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;

    let randomBytes: string;
    if (wsKey) {
      // case: a (shared) key exists for the workspace
      randomBytes = decryptAssymmetric({
        ciphertext: wsKey.encryptedKey,
        nonce: wsKey.nonce,
        publicKey: wsKey.sender.publicKey,
        privateKey: PRIVATE_KEY
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
        tag: secretKeyTag
      } = encryptSymmetric({
        plaintext: secret.key,
        key: randomBytes
      });

      // encrypt value
      const {
        ciphertext: secretValueCiphertext,
        iv: secretValueIV,
        tag: secretValueTag
      } = encryptSymmetric({
        plaintext: secret.value ?? "",
        key: randomBytes
      });

      // encrypt comment
      const {
        ciphertext: secretCommentCiphertext,
        iv: secretCommentIV,
        tag: secretCommentTag
      } = encryptSymmetric({
        plaintext: secret.comment ?? "",
        key: randomBytes
      });

      const result: EncryptedSecretProps = {
        id: secret.id,
        createdAt: "",
        environment: env,
        secretName: secret.key,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        type:
          secret.valueOverride === undefined || secret?.value !== secret?.valueOverride
            ? "shared"
            : "personal",
        tags: secret.tags
      };

      return result;
    });
  } catch (error) {
    console.log("Error while encrypting secrets");
  }

  return secrets;
};

export default encryptSecrets;
