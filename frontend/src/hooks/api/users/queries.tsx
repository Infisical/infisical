import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";
import { setAuthToken } from "@app/reactQuery";

import { useUploadWsKey } from "../keys/queries";
import {
  AddUserToOrgDTO,
  AddUserToWsDTO,
  AddUserToWsRes,
  APIKeyData,
  CreateAPIKeyRes,
  DeletOrgMembershipDTO,
  OrgUser,
  RenameUserDTO,
  TokenVersion,
  UpdateOrgUserRoleDTO,
  User} from "./types";

const userKeys = {
  getUser: ["user"] as const,
  userAction: ["user-action"] as const,
  getOrgUsers: (orgId: string) => [{ orgId }, "user"],
  myIp: ["ip"] as const,
  myAPIKeys: ["api-keys"] as const,
  mySessions: ["sessions"] as const
};

export const fetchUserDetails = async () => {
  const { data } = await apiRequest.get<{ user: User }>("/api/v1/user");

  return data.user;
};

export const useGetUser = () => useQuery(userKeys.getUser, fetchUserDetails);

const fetchUserAction = async (action: string) => {
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
      apiRequest.patch("/api/v2/users/me/name", { firstName: newName?.split(" ")[0], lastName: newName?.split(" ").slice(1).join(" ") }),
    onSuccess: () => {
      queryClient.invalidateQueries(userKeys.getUser);
    }
  });
};

export const useUpdateUserAuthProvider = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      authProvider
    }: {
      authProvider: string;
    }) => {
      const { data: { user } } = await apiRequest.patch("/api/v2/users/me/auth-provider", { 
        authProvider
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
export const useAddUserToWs = () => {
  const uploadWsKey = useUploadWsKey();

  return useMutation<{ data: AddUserToWsRes }, {}, AddUserToWsDTO>({
    mutationFn: ({ email, workspaceId }) =>
      apiRequest.post(`/api/v1/workspace/${workspaceId}/invite-signup`, { email }),
    onSuccess: ({ data }, { workspaceId }) => {
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");
      if (!PRIVATE_KEY) return;

      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: data.latestKey.encryptedKey,
        nonce: data.latestKey.nonce,
        publicKey: data.latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      const { ciphertext: inviteeCipherText, nonce: inviteeNonce } = encryptAssymmetric({
        plaintext: key,
        publicKey: data.invitee.publicKey,
        privateKey: PRIVATE_KEY
      });

      uploadWsKey.mutate({
        encryptedKey: inviteeCipherText,
        nonce: inviteeNonce,
        userId: data.invitee._id,
        workspaceId
      });
    }
  });
};

export const useAddUserToOrg = () => {
  const queryClient = useQueryClient();
  type Response  = {
    data: {
      message: string, 
      completeInviteLink: string | undefined
    }
  }

  return useMutation<Response, {}, AddUserToOrgDTO>({
    mutationFn: (dto) => apiRequest.post("/api/v1/invite-org/signup", dto),
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
    }
  });
};

export const useDeleteOrgMembership = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeletOrgMembershipDTO>({
    mutationFn: ({ membershipId, orgId }) =>
      apiRequest.delete(`/api/v2/organizations/${orgId}/memberships/${membershipId}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(orgId));
    }
  });
};

export const useUpdateOrgUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateOrgUserRoleDTO>({
    mutationFn: ({ organizationId, membershipId, role }) =>
      apiRequest.patch(`/api/v2/organizations/${organizationId}/memberships/${membershipId}`, {
        role
      }),
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

export const useLogoutUser = () =>
  useMutation({
    mutationFn: () => apiRequest.post("/api/v1/auth/logout"),
    onSuccess: () => {
      setAuthToken("");
      // Delete the cookie by not setting a value; Alternatively clear the local storage
      localStorage.setItem("publicKey", "");
      localStorage.setItem("encryptedPrivateKey", "");
      localStorage.setItem("iv", "");
      localStorage.setItem("tag", "");
      localStorage.setItem("PRIVATE_KEY", "");
    }
  });

export const useGetMyIp = () => {
 return useQuery({
    queryKey: userKeys.myIp,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ ip: string; }>(
        "/api/v1/users/me/ip"
      );
      return data.ip;
    },
    enabled: true
  }); 
}

export const useGetMyAPIKeys = () => {
  return useQuery({
    queryKey: userKeys.myAPIKeys,
    queryFn: async () => {
      const { data } = await apiRequest.get<APIKeyData[]>(
        "/api/v2/users/me/api-keys"
      );
      return data;
    },
    enabled: true
  });
}

export const useCreateAPIKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      expiresIn
    }: {
      name: string;
      expiresIn: number;
    }) => {
      const { data } = await apiRequest.post<CreateAPIKeyRes>(
        "/api/v2/users/me/api-keys",
        {
          name,
          expiresIn
        }
      );
      
      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries(userKeys.myAPIKeys);
    }
  });
}

export const useDeleteAPIKey = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiKeyDataId: string) => {
      const { data } = await apiRequest.delete(
        `/api/v2/users/me/api-keys/${apiKeyDataId}`
      );

      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries(userKeys.myAPIKeys);
    }
  });
}

export const useGetMySessions = () => {
  return useQuery({
    queryKey: userKeys.mySessions,
    queryFn: async () => {
      const { data } = await apiRequest.get<TokenVersion[]>(
        "/api/v2/users/me/sessions"
      );

      return data;
    },
    enabled: true
  });
}

export const useRevokeMySessions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      console.log("useRevokeAllSessions 1");
      const { data } = await apiRequest.delete(
        "/api/v2/users/me/sessions"
      );

      console.log("useRevokeAllSessions 2: ", data);
      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries(userKeys.mySessions);
    }
  });
}