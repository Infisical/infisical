import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { apiRequest } from "@app/config/request";
import { SessionStorageKeys } from "@app/const";
import { setAuthToken } from "@app/reactQuery";

import { APIKeyDataV2 } from "../apiKeys/types";
import { MfaMethod } from "../auth/types";
import { TGroupWithProjectMemberships } from "../groups/types";
import { workspaceKeys } from "../workspace";
import { userKeys } from "./query-keys";
import {
  AddUserToOrgDTO,
  APIKeyData,
  AuthMethod,
  CreateAPIKeyRes,
  DeletOrgMembershipDTO,
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

export const useGetUser = () => useQuery(userKeys.getUser, fetchUserDetails);

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
      localStorage.removeItem("projectData.id");

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

  return useMutation<{}, {}, RenameUserDTO>({
    mutationFn: ({ newName }) =>
      apiRequest.patch("/api/v2/users/me/name", {
        firstName: newName?.split(" ")[0],
        lastName: newName?.split(" ").slice(1).join(" ")
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(userKeys.getUser);
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
      queryClient.invalidateQueries(userKeys.getUser);
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

  return useMutation<Response, {}, AddUserToOrgDTO>({
    mutationFn: (dto) => {
      return apiRequest.post("/api/v1/invite-org/signup", dto);
    },
    onSuccess: (_, { organizationId, projects }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));

      projects?.forEach((project) => {
        if (project.slug) {
          queryClient.invalidateQueries(workspaceKeys.getWorkspaceGroupMemberships(project.slug));
        }
        queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(project.id));
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

  return useMutation<{}, {}, DeletOrgMembershipDTO>({
    mutationFn: ({ membershipId, orgId }) => {
      return apiRequest.delete(`/api/v2/organizations/${orgId}/memberships/${membershipId}`);
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(orgId));
    }
  });
};

export const useDeactivateOrgMembership = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeletOrgMembershipDTO>({
    mutationFn: ({ membershipId, orgId }) => {
      return apiRequest.post(
        `/api/v2/organizations/${orgId}/memberships/${membershipId}/deactivate`
      );
    },
    onSuccess: (_, { orgId, membershipId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(orgId));
      queryClient.invalidateQueries(userKeys.getOrgMembership(orgId, membershipId));
    }
  });
};

export const useUpdateOrgMembership = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateOrgMembershipDTO>({
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
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
      queryClient.invalidateQueries(userKeys.getOrgMembership(organizationId, membershipId));
    },
    // to remove old states
    onError: (_, { organizationId, membershipId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
      queryClient.invalidateQueries(userKeys.getOrgMembership(organizationId, membershipId));
    }
  });
};

export const useRegisterUserAction = () => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, string>({
    mutationFn: (action) => apiRequest.post("/api/v1/user-action", { action }),
    onSuccess: () => {
      queryClient.invalidateQueries(userKeys.userAction);
    }
  });
};

export const useLogoutUser = (keepQueryClient?: boolean) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest.post("/api/v1/auth/logout");
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
      sessionStorage.removeItem(SessionStorageKeys.CLI_TERMINAL_TOKEN);

      if (!keepQueryClient) {
        queryClient.clear();
      }
    }
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
      queryClient.invalidateQueries(userKeys.myAPIKeys);
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
      queryClient.invalidateQueries(userKeys.myAPIKeys);
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
      queryClient.invalidateQueries(userKeys.mySessions);
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
      queryClient.invalidateQueries(userKeys.getUser);
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

export const fetchMyPrivateKey = async () => {
  const {
    data: { privateKey }
  } = await apiRequest.get<{ privateKey: string }>("/api/v1/user/private-key");

  return privateKey;
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

export const useGetUserTotpRegistration = () => {
  return useQuery({
    queryKey: userKeys.totpRegistration,
    queryFn: async () => {
      const { data } = await apiRequest.post<{ otpUrl: string; recoveryCodes: string[] }>(
        "/api/v1/user/me/totp/register"
      );

      return data;
    }
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
