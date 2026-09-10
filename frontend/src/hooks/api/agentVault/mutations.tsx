import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { ApiErrorTypes } from "../types";
import { agentVaultKeys } from "./queries";
import {
  TAddAgentVaultMembersDTO,
  TAgentVaultAccessBundle,
  TAgentVaultConnection,
  TAgentVaultEnrollment,
  TAgentVaultMintedSession,
  TAgentVaultProductMemberActor,
  TAgentVaultProxy,
  TAgentVaultProxySettingsDTO,
  TCreateAgentVaultAccessBundleDTO,
  TCreateAgentVaultConnectionDTO,
  TCreateAgentVaultSessionDTO,
  TUpdateAgentVaultAccessBundleDTO,
  TUpdateAgentVaultConnectionDTO
} from "./types";

export const useCreateAgentVaultAccessBundle = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultAccessBundleDTO) => {
      const { data } = await apiRequest.post<{ accessBundle: TAgentVaultAccessBundle }>(
        "/api/v1/agent-vault/access-bundles",
        params
      );
      return data.accessBundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
    }
  });
};

export const useUpdateAgentVaultAccessBundle = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TUpdateAgentVaultAccessBundleDTO) => {
      const { data } = await apiRequest.patch<{ accessBundle: TAgentVaultAccessBundle }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`,
        params
      );
      return data.accessBundle;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId)
      });
    }
  });
};

export const useDeleteAgentVaultAccessBundle = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accessBundleId: string) => {
      const { data } = await apiRequest.delete<{ accessBundle: TAgentVaultAccessBundle }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`
      );
      return data.accessBundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions(currentOrg.id) });
    }
  });
};

export const useCreateAgentVaultConnection = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    // The sheet renders a host-pattern conflict inline and hands anything else back to onRequestError,
    // so the global toast must not also fire for it.
    meta: { skipValidationToast: true, handledErrorCodes: [ApiErrorTypes.BadRequestError] },
    mutationFn: async ({ accessBundleId, ...params }: TCreateAgentVaultConnectionDTO) => {
      const { data } = await apiRequest.post<{ connection: TAgentVaultConnection }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/connections`,
        params
      );
      return data;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
    }
  });
};

export const useUpdateAgentVaultConnection = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    // The sheet renders a host-pattern conflict inline and hands anything else back to onRequestError,
    // so the global toast must not also fire for it.
    meta: { skipValidationToast: true, handledErrorCodes: [ApiErrorTypes.BadRequestError] },
    mutationFn: async ({
      accessBundleId,
      connectionId,
      ...params
    }: TUpdateAgentVaultConnectionDTO) => {
      const { data } = await apiRequest.patch<{ connection: TAgentVaultConnection }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/connections/${connectionId}`,
        params
      );
      return data;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
    }
  });
};

export const useDeleteAgentVaultConnection = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      connectionId
    }: {
      accessBundleId: string;
      connectionId: string;
    }) => {
      const { data } = await apiRequest.delete<{ connection: { id: string; name: string } }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/connections/${connectionId}`
      );
      return data.connection;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
    }
  });
};

export const useAddAgentVaultAccessBundleMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMembersDTO) => {
      const { data } = await apiRequest.post<{
        members: { id: string }[];
        skipped: string[];
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/members`, params);
      return data;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
    }
  });
};

export const useRemoveAgentVaultAccessBundleMember = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      memberId
    }: {
      accessBundleId: string;
      memberId: string;
    }) => {
      const { data } = await apiRequest.delete<{ member: { id: string } }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/members/${memberId}`
      );
      return data.member;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
    }
  });
};

export const useCreateAgentVaultSession = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultSessionDTO) => {
      const { data } = await apiRequest.post<{ session: TAgentVaultMintedSession }>(
        "/api/v1/agent-vault/sessions",
        params
      );
      return data.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions(currentOrg.id) });
    }
  });
};

export const useRevokeAgentVaultSession = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data } = await apiRequest.post<{
        session: { id: string; revokedAt: string | null };
      }>(`/api/v1/agent-vault/sessions/${sessionId}/revoke`);
      return data.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions(currentOrg.id) });
    }
  });
};

export const useCreateAgentVaultProxy = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TAgentVaultProxySettingsDTO) => {
      const { data } = await apiRequest.post<{
        proxy: TAgentVaultProxy;
        token: string;
        expiresAt: string;
      }>("/api/v1/agent-vault/proxies", params);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id) });
    }
  });
};

export const useUpdateAgentVaultProxy = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proxyId,
      ...params
    }: Partial<TAgentVaultProxySettingsDTO> & { proxyId: string }) => {
      const { data } = await apiRequest.patch<{ proxy: TAgentVaultProxy }>(
        `/api/v1/agent-vault/proxies/${proxyId}`,
        params
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id) });
    }
  });
};

export const useDeleteAgentVaultProxy = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.delete<{ proxy: { id: string; name: string } }>(
        `/api/v1/agent-vault/proxies/${proxyId}`
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id) });
    }
  });
};

export const useReissueAgentVaultProxyEnrollmentToken = () =>
  useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.post<TAgentVaultEnrollment>(
        `/api/v1/agent-vault/proxies/${proxyId}/token-auth/generate-enrollment-token`
      );
      return data;
    }
  });

export const useRevokeAgentVaultProxyAccess = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.post<{ proxy: TAgentVaultProxy }>(
        `/api/v1/agent-vault/proxies/${proxyId}/revoke`
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id) });
    }
  });
};

// The member is named in the URL, so a call with no actor has nowhere to go. The role dialogs pass an
// empty actor while closed, which cannot reach a mutation, so this only fires on a genuine mistake.
const agentVaultMemberPath = ({
  userId,
  groupId,
  identityId
}: TAgentVaultProductMemberActor): string => {
  if (userId) return `users/${userId}`;
  if (groupId) return `groups/${groupId}`;
  if (identityId) return `identities/${identityId}`;
  throw new Error("Name a user, group or machine identity");
};

const invalidateProductMembers = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string
) => {
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.productMembers(orgId) });
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId) });
};

export const useAddAgentVaultProductUserMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { userIds: string[]; emails: string[]; role: string }) => {
      const { data } = await apiRequest.post<{
        members: { membershipId: string; userId?: string; role: string; createdAt: string }[];
        skipped: string[];
      }>("/api/v1/agent-vault/memberships/users", dto);
      return data;
    },
    onSuccess: () => invalidateProductMembers(queryClient, currentOrg.id)
  });
};

// Users are added through the batch route, so this covers groups and machine identities only.
export const useAddAgentVaultProductMember = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, ...actor }: TAgentVaultProductMemberActor & { role: string }) => {
      const { data } = await apiRequest.post(
        `/api/v1/agent-vault/memberships/${agentVaultMemberPath(actor)}`,
        { role }
      );
      return data;
    },
    onSuccess: () => invalidateProductMembers(queryClient, currentOrg.id)
  });
};

export const useUpdateAgentVaultProductMemberRole = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, ...actor }: TAgentVaultProductMemberActor & { role: string }) => {
      const { data } = await apiRequest.patch(
        `/api/v1/agent-vault/memberships/${agentVaultMemberPath(actor)}`,
        { role }
      );
      return data;
    },
    onSuccess: () => invalidateProductMembers(queryClient, currentOrg.id)
  });
};

export const useRemoveAgentVaultProductMember = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (actor: TAgentVaultProductMemberActor) => {
      const { data } = await apiRequest.delete(
        `/api/v1/agent-vault/memberships/${agentVaultMemberPath(actor)}`
      );
      return data;
    },
    onSuccess: () => invalidateProductMembers(queryClient, currentOrg.id)
  });
};
