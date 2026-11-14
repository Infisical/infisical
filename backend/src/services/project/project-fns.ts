import { ProjectVersion, TProjects } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";

import { AddUserToWsDTO } from "./project-types";

export const assignWorkspaceKeysToMembers = ({ members, decryptKey, userPrivateKey }: AddUserToWsDTO) => {
  if (!decryptKey.sender.publicKey) {
    throw new Error("Decrypt key sender public key not found");
  }

  const plaintextProjectKey = crypto.encryption().asymmetric().decrypt({
    ciphertext: decryptKey.encryptedKey,
    nonce: decryptKey.nonce,
    publicKey: decryptKey.sender.publicKey,
    privateKey: userPrivateKey
  });

  const newWsMembers = members.map(({ orgMembershipId, userPublicKey }) => {
    const { ciphertext: inviteeCipherText, nonce: inviteeNonce } = crypto
      .encryption()
      .asymmetric()
      .encrypt(plaintextProjectKey, userPublicKey, userPrivateKey);

    return {
      orgMembershipId,
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
  const { ciphertext: encryptedProjectKey, nonce: encryptedProjectKeyIv } = crypto
    .encryption()
    .asymmetric()
    .encrypt(randomBytes, publicKey, privateKey);

  return { key: encryptedProjectKey, iv: encryptedProjectKeyIv };
};

export const verifyProjectVersions = (projects: Pick<TProjects, "version">[], version: ProjectVersion) => {
  for (const project of projects) {
    if (project.version !== version) {
      return false;
    }
  }

  return true;
};
