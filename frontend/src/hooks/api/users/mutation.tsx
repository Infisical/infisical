import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { agentVaultKeys } from "@app/hooks/api/agentVault/queries";
import { invalidateAgentVaultRoleDependents } from "@app/hooks/api/agentVaultRoles/queries";
import { isCertManagerProject, userMembershipsBase } from "@app/hooks/api/certManagerAccess";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { projectKeys } from "../projects";
import { userKeys } from "./query-keys";
import { AddUserToWsDTONonE2EE } from "./types";

export const useAddUserToWsNonE2EE = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, AddUserToWsDTONonE2EE>({
    mutationFn: async ({ projectId, projectType, usernames, roleSlugs }) => {
      // Agent Vault adds members through its own service. Without a role, they get No Access.
      if (projectType === ProjectType.AgentVault) {
        const { data } = await apiRequest.post("/api/v1/agent-vault/members", {
          projectId,
          usernames,
          roles: roleSlugs?.length ? roleSlugs : [ProjectMembershipRole.NoAccess]
        });
        return data;
      }
      const { data } = await apiRequest.post(
        userMembershipsBase(projectType, projectId),
        { usernames, roleSlugs },
        { params: isCertManagerProject(projectType) ? { projectId } : undefined }
      );
      return data;
    },
    onSuccess: (_, { orgId, projectId, projectType }) => {
      // In Agent Vault the new members' roles also change who can use each bundle, service and skill.
      if (projectType === ProjectType.AgentVault) {
        invalidateAgentVaultRoleDependents(queryClient, orgId, projectId);
      } else {
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(orgId, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectUsers(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.getAvailableProjectUsers(projectId) });
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

export const useVerifyCurrentEmailOTP = () => {
  return useMutation({
    mutationFn: async ({ otpCode }: { otpCode: string }) => {
      const { data } = await apiRequest.post<{ success: boolean; newEmail: string }>(
        "/api/v2/users/me/email-change/verify-current",
        { otpCode }
      );
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
