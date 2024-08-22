import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { userKeys } from "./queries";
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
    mutationFn: async ({ projectId, usernames }) => {
      const { data } = await apiRequest.post(`/api/v2/workspace/${projectId}/memberships`, {
        usernames
      });
      return data;
    },
    onSuccess: (_, { orgId, projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(projectId));
      queryClient.invalidateQueries(userKeys.allOrgMembershipProjectMemberships(orgId));
    }
  });
};

export const sendEmailVerificationCode = async (username: string) => {
  return apiRequest.post("/api/v2/users/me/emails/code", {
    username
  });
};

export const useSendEmailVerificationCode = () => {
  return useMutation({
    mutationFn: async (username: string) => {
      await sendEmailVerificationCode(username);
      return {};
    }
  });
};

export const useVerifyEmailVerificationCode = () => {
  return useMutation({
    mutationFn: async ({ username, code }: { username: string; code: string }) => {
      await apiRequest.post("/api/v2/users/me/emails/verify", {
        username,
        code
      });
      return {};
    }
  });
};

export const useUpdateUserProjectFavorites = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      projectFavorites
    }: {
      orgId: string;
      projectFavorites: string[];
    }) => {
      await apiRequest.put("/api/v1/user/me/project-favorites", {
        orgId,
        projectFavorites
      });

      return {};
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(userKeys.userProjectFavorites(orgId));
    }
  });
};
