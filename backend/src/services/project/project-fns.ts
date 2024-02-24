import crypto from "crypto";

import { decryptAsymmetric, encryptAsymmetric } from "@app/lib/crypto";

import { AddUserToWsDTO } from "./project-types";

export const assignWorkspaceKeysToMembers = ({ members, decryptKey, userPrivateKey }: AddUserToWsDTO) => {
  const plaintextProjectKey = decryptAsymmetric({
    ciphertext: decryptKey.encryptedKey,
    nonce: decryptKey.nonce,
    publicKey: decryptKey.sender.publicKey,
    privateKey: userPrivateKey
  });

  const newWsMembers = members.map(({ orgMembershipId, userPublicKey, projectMembershipRole }) => {
    const { ciphertext: inviteeCipherText, nonce: inviteeNonce } = encryptAsymmetric(
      plaintextProjectKey,
      userPublicKey,
      userPrivateKey
    );

    return {
      orgMembershipId,
      projectRole: projectMembershipRole,
      workspaceEncryptedKey: inviteeCipherText,
      workspaceEncryptedNonce: inviteeNonce
    };
  });

  return newWsMembers;
};

type TCreateProjectKeyDTO = {
  publicKey: string;
  privateKey: string;
  plainProjectKey?: string;
};

export const createProjectKey = ({ publicKey, privateKey, plainProjectKey }: TCreateProjectKeyDTO) => {
  // 3. Create a random key that we'll use as the project key.
  const randomBytes = plainProjectKey || crypto.randomBytes(16).toString("hex");

  // 4. Encrypt the project key with the users key pair.
  const { ciphertext: encryptedProjectKey, nonce: encryptedProjectKeyIv } = encryptAsymmetric(
    randomBytes,
    publicKey,
    privateKey
  );

  return { key: encryptedProjectKey, iv: encryptedProjectKeyIv };
};
