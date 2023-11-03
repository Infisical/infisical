import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { AddUserToWsDTO } from "./types";

export const useAddUserToWs = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, AddUserToWsDTO>({
    mutationFn: async ({ workspaceId, members, decryptKey, userPrivateKey }) => {
      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: decryptKey.encryptedKey,
        nonce: decryptKey.nonce,
        publicKey: decryptKey.sender.publicKey,
        privateKey: userPrivateKey
      });

      const newWsMembers = members.map(({ orgMembershipId, userPublicKey }) => {
        const { ciphertext: inviteeCipherText, nonce: inviteeNonce } = encryptAssymmetric({
          plaintext: key,
          publicKey: userPublicKey,
          privateKey: userPrivateKey
        });

        return {
          orgMembershipId,
          workspaceEncryptedKey: inviteeCipherText,
          workspaceEncryptedNonce: inviteeNonce
        };
      });
      const { data } = await apiRequest.post(`/api/v2/workspace/${workspaceId}/memberships`, {
        members: newWsMembers
      });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(workspaceId));
    }
  });
};
