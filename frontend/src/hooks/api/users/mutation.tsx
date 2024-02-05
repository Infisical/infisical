import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { AddUserToWsDTOE2EE, AddUserToWsDTONonE2EE } from "./types";

export const useAddUserToWsE2EE = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, AddUserToWsDTOE2EE>({
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
      const { data } = await apiRequest.post(`/api/v1/workspace/${workspaceId}/memberships`, {
        members: newWsMembers
      });
      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(workspaceId));
    }
  });
};

export const useAddUserToWsNonE2EE = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, AddUserToWsDTONonE2EE>({
    mutationFn: async ({ projectId, emails }) => {
      const { data } = await apiRequest.post(`/api/v3/projects/${projectId}/memberships`, {
        emails
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(projectId));
    }
  });
};
