import { ProjectMembershipRole, TProjectKeys } from "@app/db/schemas";

import { decryptAsymmetric, encryptAsymmetric } from "../crypto";

type AddUserToWsDTO = {
  decryptKey: TProjectKeys & { sender: { publicKey: string } };
  userPrivateKey: string;
  members: {
    orgMembershipId: string;
    projectMembershipRole: ProjectMembershipRole;
    userPublicKey: string;
  }[];
};

export const createWsMembers = async ({ members, decryptKey, userPrivateKey }: AddUserToWsDTO) => {
  const key = decryptAsymmetric({
    ciphertext: decryptKey.encryptedKey,
    nonce: decryptKey.nonce,
    publicKey: decryptKey.sender.publicKey,
    privateKey: userPrivateKey
  });

  const newWsMembers = members.map(({ orgMembershipId, userPublicKey, projectMembershipRole }) => {
    const { ciphertext: inviteeCipherText, nonce: inviteeNonce } = encryptAsymmetric(
      key,
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
