import { UserWsKeyPair } from "@app/hooks/api/types";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "../../components/utilities/cryptography/crypto";

// refactor these to common function in frontend
export const generateBotKey = (botPublicKey: string, latestKey: UserWsKeyPair) => {
  const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

  if (!PRIVATE_KEY) {
    throw new Error("Private Key missing");
  }

  const WORKSPACE_KEY = decryptAssymmetric({
    ciphertext: latestKey.encryptedKey,
    nonce: latestKey.nonce,
    publicKey: latestKey.sender.publicKey,
    privateKey: PRIVATE_KEY
  });

  const { ciphertext, nonce } = encryptAssymmetric({
    plaintext: WORKSPACE_KEY,
    publicKey: botPublicKey,
    privateKey: PRIVATE_KEY
  });

  return { encryptedKey: ciphertext, nonce };
};
