import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { apiRequest } from "@app/config/request";
import { SessionStorageKeys } from "@app/const";
import { queryClient as qc } from "@app/hooks/api/reactQuery";

import { APIKeyDataV2 } from "../apiKeys/types";
import { MfaMethod } from "../auth/types";
import { TGroupWithProjectMemberships } from "../groups/types";
import { setAuthToken } from "../reactQuery";
import { subscriptionQueryKeys } from "../subscriptions/queries";
import { userKeys } from "./query-keys";
import {
  AddUserToOrgDTO,
  APIKeyData,
  AuthMethod,
  CreateAPIKeyRes,
  DeleteOrgMembershipBatchDTO,
  DeleteOrgMembershipDTO,
  OrgUser,
  RenameUserDTO,
  TokenVersion,
  TWorkspaceUser,
  UpdateOrgMembershipDTO,
  User,
  UserEnc
} from "./types";

export const fetchUserDetails = async () => {
  const { data } = await apiRequest.get<{ user: User & UserEnc }>("/api/v1/user");
  return data.user;
};

export const useGetUser = () =>
  useQuery({
    queryKey: userKeys.getUser,
    queryFn: fetchUserDetails
  });

export const fetchUserDuplicateAccounts = async () => {
  const { data } = await apiRequest.get<{
    users: Array<
      User & {
        isMyAccount: boolean;
        organizations: { name: string; slug: string }[];
        devices: {
          ip: string;
          userAgent: string;
        }[];
      }
    >;
  }>("/api/v1/user/duplicate-accounts");
  return data.users;
};

export const useGetMyDuplicateAccount = () =>
  useQuery({
    queryKey: userKeys.getMyDuplicateAccount,
    staleTime: 60 * 1000, // 1 min in ms
    queryFn: fetchUserDuplicateAccounts,
    select: (users) => ({
      duplicateAccounts: users.filter((el) => !el.isMyAccount),
      myAccount: users?.find((el) => el.isMyAccount)
    })
  });

export const useDeleteMe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const {
        data: { user }
      } = await apiRequest.delete<{ user: User }>("/api/v2/users/me");
      return user;
    },
    onSuccess: () => {
      localStorage.removeItem("protectedKey");
      localStorage.removeItem("protectedKeyIV");
      localStorage.removeItem("protectedKeyTag");
      localStorage.removeItem("publicKey");
      localStorage.removeItem("encryptedPrivateKey");
      localStorage.removeItem("iv");
      localStorage.removeItem("tag");
      localStorage.removeItem("PRIVATE_KEY");
      localStorage.removeItem("orgData.id");

      setAuthToken("");

      queryClient.clear();
    }
  });
};

export const fetchUserAction = async (action: string) => {
  const { data } = await apiRequest.get<{ userAction: string }>("/api/v1/user-action", {
    params: {
      action
    }
  });
  return data.userAction || "";
};

export const fetchUserProjectFavorites = async (orgId: string) => {
  const { data } = await apiRequest.get<{ projectFavorites: string[] }>(
    `/api/v1/user/me/project-favorites?orgId=${orgId}`
  );

  return data.projectFavorites;
};

export const useRenameUser = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, RenameUserDTO>({
    mutationFn: ({ newName }) =>
      apiRequest.patch("/api/v2/users/me/name", {
        firstName: newName?.split(" ")[0],
        lastName: newName?.split(" ").slice(1).join(" ")
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.getUser });
    }
  });
};

export const useUpdateUserAuthMethods = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ authMethods }: { authMethods: AuthMethod[] }) => {
      const {
        data: { user }
      } = await apiRequest.put("/api/v2/users/me/auth-methods", {
        authMethods
      });

      return user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.getUser });
    }
  });
};

export const useGetUserAction = (action: string) =>
  useQuery({
    queryKey: userKeys.userAction,
    queryFn: () => fetchUserAction(action)
  });

export const fetchOrgUsers = async (orgId: string) => {
  const { data } = await apiRequest.get<{ users: OrgUser[] }>(
    `/api/v1/organization/${orgId}/users`
  );

  return data.users;
};

export const useGetUserProjectFavorites = (orgId: string) =>
  useQuery({
    queryKey: userKeys.userProjectFavorites(orgId),
    queryFn: () => fetchUserProjectFavorites(orgId)
  });

export const useGetOrgUsers = (orgId: string) =>
  useQuery({
    queryKey: userKeys.getOrgUsers(orgId),
    queryFn: () => fetchOrgUsers(orgId),
    enabled: Boolean(orgId)
  });

// mutation
// TODO(akhilmhdh): move all mutation to mutation file
export const useAddUsersToOrg = () => {
  const queryClient = useQueryClient();
  type Response = {
    data: {
      message: string;
      completeInviteLinks?: {
        email: string;
        link: string;
      }[];
    };
  };

  return useMutation<Response, object, AddUserToOrgDTO>({
    mutationFn: (dto) => {
      return apiRequest.post("/api/v1/invite-org/signup", dto);
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.getOrgUsers(organizationId) });
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId)
      });
    }
  });
};

export const useGetOrgMembership = (organizationId: string, orgMembershipId: string) => {
  return useQuery({
    queryKey: userKeys.getOrgMembership(organizationId, orgMembershipId),
    queryFn: async () => {
      const {
        data: { membership }
      } = await apiRequest.get<{ membership: OrgUser }>(
        `/api/v2/organizations/${organizationId}/memberships/${orgMembershipId}`
      );

      return membership;
    },
    enabled: Boolean(organizationId) && Boolean(orgMembershipId)
  });
};

export const useGetOrgMembershipProjectMemberships = (
  organizationId: string,
  orgMembershipId: string
) => {
  return useQuery({
    queryKey: userKeys.forOrgMembershipProjectMemberships(organizationId, orgMembershipId),
    queryFn: async () => {
      const {
        data: { memberships }
      } = await apiRequest.get<{ memberships: TWorkspaceUser[] }>(
        `/api/v2/organizations/${organizationId}/memberships/${orgMembershipId}/project-memberships`
      );

      return memberships;
    },
    enabled: Boolean(organizationId) && Boolean(orgMembershipId)
  });
};

export const useDeleteOrgMembership = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, DeleteOrgMembershipDTO>({
    mutationFn: ({ membershipId, orgId }) => {
      return apiRequest.delete(`/api/v2/organizations/${orgId}/memberships/${membershipId}`);
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.getOrgUsers(orgId) });
    }
  });
};

export const useDeleteOrgMembershipBatch = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, DeleteOrgMembershipBatchDTO>({
    mutationFn: ({ membershipIds, orgId }) => {
      return apiRequest.delete(`/api/v2/organizations/${orgId}/memberships`, {
        data: {
          membershipIds
        }
      });
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.getOrgUsers(orgId) });
    }
  });
};

export const useDeactivateOrgMembership = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, DeleteOrgMembershipDTO>({
    mutationFn: ({ membershipId, orgId }) => {
      return apiRequest.post(
        `/api/v2/organizations/${orgId}/memberships/${membershipId}/deactivate`
      );
    },
    onSuccess: (_, { orgId, membershipId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.getOrgUsers(orgId) });
      queryClient.invalidateQueries({ queryKey: userKeys.getOrgMembership(orgId, membershipId) });
    }
  });
};

export const useUpdateOrgMembership = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, UpdateOrgMembershipDTO>({
    mutationFn: ({ organizationId, membershipId, role, isActive, metadata }) => {
      return apiRequest.patch(
        `/api/v2/organizations/${organizationId}/memberships/${membershipId}`,
        {
          role,
          isActive,
          metadata
        }
      );
    },
    onSuccess: (_, { organizationId, membershipId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.getOrgUsers(organizationId) });
      queryClient.invalidateQueries({
        queryKey: userKeys.getOrgMembership(organizationId, membershipId)
      });
    },
    // to remove old states
    onError: (_, { organizationId, membershipId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.getOrgUsers(organizationId) });
      queryClient.invalidateQueries({
        queryKey: userKeys.getOrgMembership(organizationId, membershipId)
      });
    }
  });
};

export const useRegisterUserAction = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, string>({
    mutationFn: (action) => apiRequest.post("/api/v1/user-action", { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.userAction });
    }
  });
};

export const logoutUser = async () => {
  await apiRequest.post("/api/v1/auth/logout");
};

// Utility function to clear session storage and query cache
export const clearSession = (keepQueryClient?: boolean) => {
  setAuthToken(""); // Clear authentication token
  localStorage.removeItem("protectedKey");
  localStorage.removeItem("protectedKeyIV");
  localStorage.removeItem("protectedKeyTag");
  localStorage.removeItem("publicKey");
  localStorage.removeItem("encryptedPrivateKey");
  localStorage.removeItem("iv");
  localStorage.removeItem("tag");
  localStorage.removeItem("PRIVATE_KEY");
  localStorage.removeItem("orgData.id");
  sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);

  if (!keepQueryClient) {
    qc.invalidateQueries();
  }
};

export const useLogoutUser = (keepQueryClient?: boolean) => {
  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => clearSession(keepQueryClient)
  });
};

export const useGetMyIp = () => {
  return useQuery({
    queryKey: userKeys.myIp,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ ip: string }>("/api/v1/users/me/ip");
      return data.ip;
    },
    enabled: true
  });
};

export const useGetMyAPIKeys = () => {
  // TODO: deprecate (moving to API Key V2)
  return useQuery({
    queryKey: userKeys.myAPIKeys,
    queryFn: async () => {
      const { data } = await apiRequest.get<APIKeyData[]>("/api/v2/users/me/api-keys");
      return data;
    },
    enabled: true
  });
};

export const useGetMyAPIKeysV2 = () => {
  return useQuery({
    queryKey: userKeys.myAPIKeysV2,
    queryFn: async () => {
      const {
        data: { apiKeyData }
      } = await apiRequest.get<{ apiKeyData: APIKeyDataV2[] }>("/api/v3/users/me/api-keys");
      return apiKeyData;
    },
    enabled: true
  });
};

export const useCreateAPIKey = () => {
  // TODO: deprecate (moving to API Key V2)
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, expiresIn }: { name: string; expiresIn: number }) => {
      const { data } = await apiRequest.post<CreateAPIKeyRes>("/api/v2/users/me/api-keys", {
        name,
        expiresIn
      });

      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: userKeys.myAPIKeys });
    }
  });
};

export const useDeleteAPIKey = () => {
  // TODO: deprecate (moving to API Key V2)
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiKeyDataId: string) => {
      const { data } = await apiRequest.delete(`/api/v2/users/me/api-keys/${apiKeyDataId}`);

      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: userKeys.myAPIKeys });
    }
  });
};

export const useGetMySessions = () => {
  return useQuery({
    queryKey: userKeys.mySessions,
    queryFn: async () => {
      const { data } = await apiRequest.get<TokenVersion[]>("/api/v2/users/me/sessions");

      return data;
    },
    enabled: true
  });
};

export const useRevokeMySessions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiRequest.delete("/api/v2/users/me/sessions");

      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: userKeys.mySessions });
    }
  });
};

export const useUpdateUserMfa = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      isMfaEnabled,
      selectedMfaMethod
    }: {
      isMfaEnabled?: boolean;
      selectedMfaMethod?: MfaMethod;
    }) => {
      const {
        data: { user }
      } = await apiRequest.patch("/api/v2/users/me/mfa", {
        isMfaEnabled,
        selectedMfaMethod
      });

      return user;
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: userKeys.getUser });
    }
  });
};

export const fetchMyOrganizationProjects = async (orgId: string) => {
  const {
    data: { workspaces }
  } = await apiRequest.get(`/api/v1/organization/${orgId}/my-workspaces`);

  return workspaces;
};

export const useGetMyOrganizationProjects = (orgId: string) => {
  return useQuery({
    queryKey: userKeys.myOrganizationProjects(orgId),
    queryFn: async () => {
      return fetchMyOrganizationProjects(orgId);
    },
    enabled: true
  });
};

export const useListUserGroupMemberships = (username: string) => {
  return useQuery({
    queryKey: userKeys.listUserGroupMemberships(username),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGroupWithProjectMemberships[]>(
        `/api/v1/user/me/${username}/groups`
      );

      return data;
    }
  });
};

export const useGetUserTotpRegistration = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: userKeys.totpRegistration,
    queryFn: async () => {
      const { data } = await apiRequest.post<{ otpUrl: string; recoveryCodes: string[] }>(
        "/api/v1/user/me/totp/register"
      );

      return data;
    },
    enabled: options?.enabled ?? true
  });
};

export const useGetUserTotpConfiguration = () => {
  return useQuery({
    queryKey: userKeys.totpConfiguration,
    queryFn: async () => {
      try {
        const { data } = await apiRequest.get<{ isVerified: boolean; recoveryCodes: string[] }>(
          "/api/v1/user/me/totp"
        );

        return data;
      } catch (error) {
        if (error instanceof AxiosError && [404, 400].includes(error.response?.data?.statusCode)) {
          return {
            isVerified: false,
            recoveryCodes: []
          };
        }
        throw error;
      }
    }
  });
};
