import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { ApiErrorTypes } from "../types";
import { AgentVaultMemberType } from "./enums";
import { agentVaultKeys } from "./queries";
import {
  TAddAgentVaultMembersDTO,
  TAddAgentVaultProductMembersDTO,
  TAgentVaultAccessBundle,
  TAgentVaultActorIdsDTO,
  TAgentVaultActorRef,
  TAgentVaultEnrollment,
  TAgentVaultMemberWriteResult,
  TAgentVaultMintedSession,
  TAgentVaultProxy,
  TAgentVaultProxySettingsDTO,
  TAgentVaultService,
  TAgentVaultWrittenMember,
  TCreateAgentVaultAccessBundleDTO,
  TCreateAgentVaultServiceDTO,
  TCreateAgentVaultSessionDTO,
  TUpdateAgentVaultAccessBundleDTO,
  TUpdateAgentVaultServiceDTO
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

export const useCreateAgentVaultService = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    // The sheet renders a host-pattern conflict inline and hands anything else back to onRequestError,
    // so the global toast must not also fire for it.
    meta: { skipValidationToast: true, handledErrorCodes: [ApiErrorTypes.BadRequestError] },
    mutationFn: async ({ accessBundleId, ...params }: TCreateAgentVaultServiceDTO) => {
      const { data } = await apiRequest.post<{ service: TAgentVaultService }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/services`,
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

export const useUpdateAgentVaultService = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    // The sheet renders a host-pattern conflict inline and hands anything else back to onRequestError,
    // so the global toast must not also fire for it.
    meta: { skipValidationToast: true, handledErrorCodes: [ApiErrorTypes.BadRequestError] },
    mutationFn: async ({ accessBundleId, serviceId, ...params }: TUpdateAgentVaultServiceDTO) => {
      const { data } = await apiRequest.patch<{ service: TAgentVaultService }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/services/${serviceId}`,
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

export const useDeleteAgentVaultService = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      serviceId
    }: {
      accessBundleId: string;
      serviceId: string;
    }) => {
      const { data } = await apiRequest.delete<{ service: { id: string; name: string } }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/services/${serviceId}`
      );
      return data.service;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(currentOrg.id) });
    }
  });
};

const ACTOR_PATH: Record<AgentVaultMemberType, string> = {
  [AgentVaultMemberType.User]: "users",
  [AgentVaultMemberType.Group]: "groups",
  [AgentVaultMemberType.MachineIdentity]: "machine-identities"
};

export const useAddAgentVaultAccessBundleMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMembersDTO) => {
      const { data } = await apiRequest.post<{
        members: { id: string }[];
        skipped: { type: AgentVaultMemberType; id: string }[];
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

export const useRevokeAgentVaultAccessBundleMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMembersDTO) => {
      const { data } = await apiRequest.post<
        TAgentVaultMemberWriteResult<{ id: string; actor: TAgentVaultActorRef }>
      >(`/api/v1/agent-vault/access-bundles/${accessBundleId}/members/revoke`, params);
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
        `/api/v1/agent-vault/proxies/${proxyId}/token-auth/enrollment-token`
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
// Removing a product member strips their bundle grants, so the bundle queries go too.
const invalidateMembers = (queryClient: ReturnType<typeof useQueryClient>, orgId: string) => {
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(orgId) });
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId) });
};

export const useAddAgentVaultMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TAddAgentVaultProductMembersDTO) => {
      const { data } = await apiRequest.post<
        TAgentVaultMemberWriteResult<TAgentVaultWrittenMember>
      >("/api/v1/agent-vault/members", dto);
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id)
  });
};

export const useUpdateAgentVaultMemberRole = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ actor, role }: { actor: TAgentVaultActorRef; role: string }) => {
      const { data } = await apiRequest.patch<{ member: TAgentVaultWrittenMember }>(
        `/api/v1/agent-vault/members/${ACTOR_PATH[actor.type]}/${actor.id}`,
        { role }
      );
      return data.member;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id)
  });
};

export const useRevokeAgentVaultMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TAgentVaultActorIdsDTO) => {
      const { data } = await apiRequest.post<
        TAgentVaultMemberWriteResult<TAgentVaultWrittenMember>
      >("/api/v1/agent-vault/members/revoke", dto);
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id)
  });
};
