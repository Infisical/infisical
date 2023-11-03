import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { setAuthToken } from "@app/reactQuery";

import { APIKeyDataV2 } from "../apiKeys/types";
import {
  AddUserToOrgDTO,
  APIKeyData,
  AuthMethod,
  CreateAPIKeyRes,
  DeletOrgMembershipDTO,
  OrgUser,
  RenameUserDTO,
  TokenVersion,
  UpdateOrgUserRoleDTO,
  User
} from "./types";

export const userKeys = {
  getUser: ["user"] as const,
  userAction: ["user-action"] as const,
  getOrgUsers: (orgId: string) => [{ orgId }, "user"],
  myIp: ["ip"] as const,
  myAPIKeys: ["api-keys"] as const,
  myAPIKeysV2: ["api-keys-v2"] as const,
  mySessions: ["sessions"] as const,
  myOrganizationProjects: (orgId: string) => [{ orgId }, "organization-projects"] as const
};

export const fetchUserDetails = async () => {
  const { data } = await apiRequest.get<{ user: User }>("/api/v1/user");

  return data.user;
};

export const useGetUser = () => useQuery(userKeys.getUser, fetchUserDetails);

export const useDeleteUser = () => {
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
  return data.userAction;
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

export const useGetOrgUsers = (orgId: string) =>
  useQuery({
    queryKey: userKeys.getOrgUsers(orgId),
    queryFn: () => fetchOrgUsers(orgId),
    enabled: Boolean(orgId)
  });

// mutation
// TODO(akhilmhdh): move all mutation to mutation file
export const useAddUserToOrg = () => {
  const queryClient = useQueryClient();
  type Response = {
    data: {
      message: string;
      completeInviteLink: string | undefined;
    };
  };

  return useMutation<Response, {}, AddUserToOrgDTO>({
    mutationFn: (dto) => {
      return apiRequest.post("/api/v1/invite-org/signup", dto);
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
    }
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

export const useUpdateOrgUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateOrgUserRoleDTO>({
    mutationFn: ({ organizationId, membershipId, role }) => {
      return apiRequest.patch(
        `/api/v2/organizations/${organizationId}/memberships/${membershipId}`,
        {
          role
        }
      );
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
    },
    // to remove old states
    onError: (_, { organizationId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
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

export const useLogoutUser = () => {
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

      queryClient.clear();
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

export const useUpdateMfaEnabled = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ isMfaEnabled }: { isMfaEnabled: boolean }) => {
      const {
        data: { user }
      } = await apiRequest.patch("/api/v2/users/me/mfa", {
        isMfaEnabled
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
