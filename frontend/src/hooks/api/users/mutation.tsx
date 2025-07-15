import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace";
import { userKeys } from "./query-keys";
import { AddUserToWsDTONonE2EE } from "./types";

export const useAddUserToWsNonE2EE = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, AddUserToWsDTONonE2EE>({
    mutationFn: async ({ projectId, usernames, roleSlugs }) => {
      const { data } = await apiRequest.post(`/api/v2/workspace/${projectId}/memberships`, {
        usernames,
        roleSlugs
      });
      return data;
    },
    onSuccess: (_, { orgId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getWorkspaceUsers(projectId) });
      queryClient.invalidateQueries({
        queryKey: userKeys.allOrgMembershipProjectMemberships(orgId)
      });
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
      queryClient.invalidateQueries({ queryKey: userKeys.userProjectFavorites(orgId) });
    }
  });
};

export const useVerifyUserTotpRegistration = () => {
  return useMutation({
    mutationFn: async ({ totp }: { totp: string }) => {
      await apiRequest.post("/api/v1/user/me/totp/verify", {
        totp
      });

      return {};
    }
  });
};

export const useDeleteUserTotpConfiguration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest.delete("/api/v1/user/me/totp");

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration });
    }
  });
};

export const useCreateNewTotpRecoveryCodes = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest.post("/api/v1/user/me/totp/recovery-codes");

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration });
    }
  });
};

export const useResendOrgMemberInvitation = () => {
  return useMutation({
    mutationFn: async (dto: { membershipId: string }) => {
      const { data } = await apiRequest.post<{
        signupToken?: {
          email: string;
          link: string;
        };
      }>("/api/v1/invite-org/signup-resend", dto);

      return data.signupToken;
    }
  });
};

export const useRevokeMySessionById = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data } = await apiRequest.delete(`/api/v2/users/me/sessions/${sessionId}`);
      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: userKeys.mySessions });
    }
  });
};

export const useRemoveMyDuplicateAccounts = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiRequest.post("/api/v1/user/remove-duplicate-accounts");
      return data;
    }
  });
};
