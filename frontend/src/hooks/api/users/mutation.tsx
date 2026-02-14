import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectKeys } from "../projects";
import { userKeys } from "./query-keys";
import { AddUserToWsDTONonE2EE } from "./types";

export const useAddUserToWsNonE2EE = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, AddUserToWsDTONonE2EE>({
    mutationFn: async ({ projectId, usernames, roleSlugs }) => {
      const { data } = await apiRequest.post(`/api/v1/projects/${projectId}/memberships`, {
        usernames,
        roleSlugs
      });
      return data;
    },
    onSuccess: (_, { orgId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectUsers(projectId) });
      queryClient.invalidateQueries({
        queryKey: userKeys.allOrgMembershipProjectMemberships(orgId)
      });
    }
  });
};

export const sendEmailVerificationCode = async (token: string) => {
  return apiRequest.post("/api/v2/users/me/emails/code", {
    token
  });
};

export const useSendEmailVerificationCode = () => {
  return useMutation({
    mutationFn: async (token: string) => {
      await sendEmailVerificationCode(token);
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
  return useMutation<{ recoveryCodes: string[] }, unknown, { totp: string }>({
    mutationFn: async ({ totp }: { totp: string }) => {
      const { data } = await apiRequest.post<{ recoveryCodes: string[] }>(
        "/api/v1/user/me/totp/verify",
        {
          totp
        }
      );

      return data;
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
      await apiRequest.post("/api/v1/user/me/totp/recovery-codes", {});

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
      const { data } = await apiRequest.post("/api/v1/user/remove-duplicate-accounts", {});
      return data;
    }
  });
};

export const useRequestEmailChangeOTP = () => {
  return useMutation({
    mutationFn: async ({ newEmail }: { newEmail: string }) => {
      const { data } = await apiRequest.post("/api/v2/users/me/email-change/otp", {
        newEmail
      });
      return data;
    }
  });
};

export const useUpdateUserEmail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ newEmail, otpCode }: { newEmail: string; otpCode: string }) => {
      const { data } = await apiRequest.patch("/api/v2/users/me/email", {
        newEmail,
        otpCode
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.getUser });
    }
  });
};
