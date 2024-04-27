import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";
import { setAuthToken } from "@app/reactQuery";

import { workspaceKeys } from "../workspace/queries";
import { userKeys } from "./queries";
import { AddUserToWsDTOE2EE, AddUserToWsDTONonE2EE, User } from "./types";

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
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(projectId));
    }
  });
};

export const sendEmailVerificationCode = async () => {
  return apiRequest.post("/api/v2/users/me/emails/code");
};

export const useSendEmailVerificationCode = () => {
  return useMutation({
    mutationFn: async () => {
      await sendEmailVerificationCode();
      return {};
    }
  });
};

export const useVerifyEmailVerificationCode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      await apiRequest.post("/api/v2/users/me/emails/verify", {
        code
      });
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries(userKeys.usersWithMyEmail);
    }
  });
};

export const useMergeUsers = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ username }: { username: string }) => {
      const { data } = await apiRequest.post<{ user: User }>("/api/v2/users/me/users/merge-user", {
        username
      });
      return data;
    },
    onSuccess: () => {
      setAuthToken("");
      // Delete the cookie by not setting a value; Alternatively clear the local storage
      localStorage.removeItem("protectedKey");
      localStorage.removeItem("protectedKeyIV");
      localStorage.removeItem("protectedKeyTag");
      localStorage.removeItem("publicKey");
      localStorage.removeItem("encryptedPrivateKey");
      localStorage.removeItem("iv");
      localStorage.removeItem("tag");
      localStorage.removeItem("PRIVATE_KEY");
      localStorage.removeItem("orgData.id");
      localStorage.removeItem("projectData.id");

      queryClient.clear();
    }
  });
};
