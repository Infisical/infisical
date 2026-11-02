import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { ApiErrorTypes } from "../types";
import { agentVaultKeys } from "./queries";
import {
  TAddAgentVaultMembersDTO,
  TAddAgentVaultProductMembersDTO,
  TAgentVaultAccessBundle,
  TAgentVaultActorIdsDTO,
  TAgentVaultActorRef,
  TAgentVaultBundleSkill,
  TAgentVaultDelegation,
  TAgentVaultDelegationDetail,
  TAgentVaultGrantedMember,
  TAgentVaultMemberWriteResult,
  TAgentVaultMintedSession,
  TAgentVaultOauthAuthorization,
  TAgentVaultPersonalValues,
  TAgentVaultProxy,
  TAgentVaultProxySettingsDTO,
  TAgentVaultProxyWithToken,
  TAgentVaultService,
  TAgentVaultSession,
  TAgentVaultSessionLogSettingsState,
  TAgentVaultSkillSummary,
  TAgentVaultSkillVersion,
  TAgentVaultVariable,
  TAgentVaultWrittenMember,
  TChangeAgentVaultDelegationSubjectsDTO,
  TCompleteAgentVaultOauthAuthorizationDTO,
  TCreateAgentVaultAccessBundleDTO,
  TCreateAgentVaultOauthAuthorizationDTO,
  TCreateAgentVaultOauthAuthorizationResponse,
  TCreateAgentVaultServiceDTO,
  TCreateAgentVaultSessionDTO,
  TCreateAgentVaultSkillDTO,
  TCreateAgentVaultVariableDTO,
  TDeleteAgentVaultPersonalValuesDTO,
  TSetAgentVaultDelegationDTO,
  TSetAgentVaultPersonalValuesDTO,
  TUpdateAgentVaultAccessBundleDTO,
  TUpdateAgentVaultMemberRolesDTO,
  TUpdateAgentVaultServiceDTO,
  TUpdateAgentVaultSessionLabelDTO,
  TUpdateAgentVaultSessionLogSettingsDTO,
  TUpdateAgentVaultSkillDTO,
  TUpdateAgentVaultVariableDTO
} from "./types";

// A save sends the whole list, so the next edit has to start from its result, not from a refetch that
// reads a replica which may not have the write yet. A read already in flight is cancelled first, or
// it could land after this and put the old list back. The candidates are refetched, since they
// depend on who is in the delegation.
const useWriteDelegationResult = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return async (machineIdentityId: string, delegation: TAgentVaultDelegationDetail | null) => {
    const queryKey = agentVaultKeys.delegation(currentOrg.id, machineIdentityId);
    await queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData(queryKey, delegation);
    await queryClient.invalidateQueries({
      queryKey: agentVaultKeys.availableDelegationSubjects(currentOrg.id, machineIdentityId)
    });
  };
};

export const useSetAgentVaultDelegation = () => {
  const writeResult = useWriteDelegationResult();
  return useMutation({
    mutationFn: async ({ machineIdentityId, ...body }: TSetAgentVaultDelegationDTO) => {
      const { data } = await apiRequest.put<{ delegation: TAgentVaultDelegationDetail }>(
        `/api/v1/agent-vault/delegations/${machineIdentityId}`,
        body
      );
      return data.delegation;
    },
    onSuccess: (delegation, { machineIdentityId }) => writeResult(machineIdentityId, delegation)
  });
};

export const useDeleteAgentVaultDelegation = () => {
  const writeResult = useWriteDelegationResult();
  return useMutation({
    mutationFn: async ({ machineIdentityId }: { machineIdentityId: string }) => {
      const { data } = await apiRequest.delete<{ delegation: TAgentVaultDelegation }>(
        `/api/v1/agent-vault/delegations/${machineIdentityId}`
      );
      return data.delegation;
    },
    onSuccess: (_, { machineIdentityId }) => writeResult(machineIdentityId, null)
  });
};

// Adds to the delegation without resending who is already in it, so it can't undo another change.
export const useAddAgentVaultDelegationSubjects = () => {
  const writeResult = useWriteDelegationResult();
  return useMutation({
    mutationFn: async ({ machineIdentityId, ...body }: TChangeAgentVaultDelegationSubjectsDTO) => {
      const { data } = await apiRequest.post<{ delegation: TAgentVaultDelegationDetail }>(
        `/api/v1/agent-vault/delegations/${machineIdentityId}/subjects`,
        body
      );
      return data.delegation;
    },
    onSuccess: (delegation, { machineIdentityId }) => writeResult(machineIdentityId, delegation)
  });
};

// null once the delegation names no one, which reads as no delegation.
export const useRemoveAgentVaultDelegationSubjects = () => {
  const writeResult = useWriteDelegationResult();
  return useMutation({
    mutationFn: async ({ machineIdentityId, ...body }: TChangeAgentVaultDelegationSubjectsDTO) => {
      const { data } = await apiRequest.delete<{ delegation: TAgentVaultDelegationDetail | null }>(
        `/api/v1/agent-vault/delegations/${machineIdentityId}/subjects`,
        { data: body }
      );
      return data.delegation;
    },
    onSuccess: (delegation, { machineIdentityId }) => writeResult(machineIdentityId, delegation)
  });
};

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
      // A variable's usedByServices names each service's bundle.
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(currentOrg.id) });
      // A skill lists the bundles it is in by name.
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.skills(currentOrg.id) });
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(currentOrg.id) });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.skills(currentOrg.id) });
    }
  });
};

// The service sheet renders these inline when it recognizes them (a host-pattern conflict, an authorization that
// expired or was already used) and hands the rest back to onRequestError, so the global toast must not also fire.
export const SERVICE_SAVE_HANDLED_ERROR_CODES: string[] = [
  ApiErrorTypes.BadRequestError,
  ApiErrorTypes.ConflictError,
  ApiErrorTypes.NotFoundError
];

export const useCreateAgentVaultService = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { skipValidationToast: true, handledErrorCodes: SERVICE_SAVE_HANDLED_ERROR_CODES },
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(currentOrg.id) });
    }
  });
};

export const useUpdateAgentVaultService = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { skipValidationToast: true, handledErrorCodes: SERVICE_SAVE_HANDLED_ERROR_CODES },
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(currentOrg.id) });
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(currentOrg.id) });
    }
  });
};

export const useAddAgentVaultAccessBundleMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMembersDTO) => {
      const { data } = await apiRequest.post<
        TAgentVaultMemberWriteResult<TAgentVaultGrantedMember>
      >(`/api/v1/agent-vault/access-bundles/${accessBundleId}/members`, params);
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
      const { data } = await apiRequest.delete<TAgentVaultMemberWriteResult<TAgentVaultActorRef>>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`,
        { data: params }
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

export const useUpdateAgentVaultSessionLabel = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, label }: TUpdateAgentVaultSessionLabelDTO) => {
      const { data } = await apiRequest.patch<{ session: TAgentVaultSession }>(
        `/api/v1/agent-vault/sessions/${sessionId}`,
        { label }
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
      const { data } = await apiRequest.post<TAgentVaultProxyWithToken>(
        "/api/v1/agent-vault/proxies",
        params
      );
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

export const useRotateAgentVaultProxyToken = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.post<TAgentVaultProxyWithToken>(
        `/api/v1/agent-vault/proxies/${proxyId}/token-auth/proxy-token`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id) });
    }
  });
};

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
        TAgentVaultMemberWriteResult<
          TAgentVaultWrittenMember,
          TAgentVaultActorRef & { identifier: string }
        >
      >("/api/v1/agent-vault/members", dto);
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id)
  });
};

export const useUpdateAgentVaultMemberRoles = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TUpdateAgentVaultMemberRolesDTO) => {
      const { data } = await apiRequest.patch<
        TAgentVaultMemberWriteResult<TAgentVaultWrittenMember>
      >("/api/v1/agent-vault/members", dto);
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id)
  });
};

export const useRevokeAgentVaultMembers = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TAgentVaultActorIdsDTO) => {
      const { data } = await apiRequest.delete<TAgentVaultMemberWriteResult<TAgentVaultActorRef>>(
        "/api/v1/agent-vault/members",
        { data: dto }
      );
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id)
  });
};

export const useUpdateAgentVaultSessionLogSettings = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: TUpdateAgentVaultSessionLogSettingsDTO) => {
      const { data } = await apiRequest.patch<TAgentVaultSessionLogSettingsState>(
        "/api/v1/agent-vault/settings/session-logs",
        params
      );
      return data;
    },
    onSuccess: (state) => {
      queryClient.setQueryData(agentVaultKeys.sessionLogSettings(currentOrg.id), state);
      // Reset, not invalidate: the cached result may be for the previous bucket.
      queryClient.resetQueries({
        queryKey: agentVaultKeys.sessionLogCorsProbe(currentOrg.id)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessionLogHealth(currentOrg.id)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions(currentOrg.id) });
    }
  });
};

// A rename changes the keys each service's variableReferences, and each personal value's, reports, so those refresh
// too.
const invalidateVariables = (queryClient: ReturnType<typeof useQueryClient>, orgId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(orgId) }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId) })
  ]);

export const useCreateAgentVaultVariable = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultVariableDTO) => {
      const { data } = await apiRequest.post<{ variable: TAgentVaultVariable }>(
        "/api/v1/agent-vault/variables",
        params
      );
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, currentOrg.id)
  });
};

export const useUpdateAgentVaultVariable = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ variableId, ...params }: TUpdateAgentVaultVariableDTO) => {
      const { data } = await apiRequest.patch<{ variable: TAgentVaultVariable }>(
        `/api/v1/agent-vault/variables/${variableId}`,
        params
      );
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, currentOrg.id)
  });
};

export const useDeleteAgentVaultVariable = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variableId: string) => {
      const { data } = await apiRequest.delete<{ variable: TAgentVaultVariable }>(
        `/api/v1/agent-vault/variables/${variableId}`
      );
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, currentOrg.id)
  });
};

// A mutation rather than a query, so a revealed value never enters the query cache.
export const useRevealAgentVaultVariableValue = () =>
  useMutation({
    mutationFn: async (variableId: string) => {
      const { data } = await apiRequest.get<{ value: string }>(
        `/api/v1/agent-vault/variables/${variableId}/value`
      );
      return data.value;
    }
  });

export const useCreateAgentVaultOauthAuthorization = () =>
  useMutation({
    // The Authorize card shows every failure in place, discovery and registration ones naming the server.
    meta: { skipErrorToast: true },
    mutationFn: async (params: TCreateAgentVaultOauthAuthorizationDTO) => {
      const { data } = await apiRequest.post<TCreateAgentVaultOauthAuthorizationResponse>(
        "/api/v1/agent-vault/oauth/authorizations",
        params
      );
      return data;
    }
  });

export const useCompleteAgentVaultOauthAuthorization = () =>
  useMutation({
    // The callback page shows every outcome itself.
    meta: { handledErrorCodes: [ApiErrorTypes.BadRequestError, ApiErrorTypes.NotFoundError] },
    mutationFn: async ({
      authorizationId,
      ...params
    }: TCompleteAgentVaultOauthAuthorizationDTO) => {
      const { data } = await apiRequest.post<{ authorization: TAgentVaultOauthAuthorization }>(
        `/api/v1/agent-vault/oauth/authorizations/${encodeURIComponent(authorizationId)}/complete`,
        params
      );
      return data.authorization;
    }
  });

// The status shows on the bundle read and the bundle list, and Used By on personal variables follows the references.
const invalidatePersonalValues = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  accessBundleId: string
) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundle(orgId, accessBundleId) }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId) }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(orgId) })
  ]);

export const useSetAgentVaultPersonalValues = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      serviceId,
      ...params
    }: TSetAgentVaultPersonalValuesDTO) => {
      const { data } = await apiRequest.patch<{ personalValues: TAgentVaultPersonalValues }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/services/${serviceId}/personal-values`,
        params
      );
      return data.personalValues;
    },
    onSuccess: (_, { accessBundleId }) =>
      invalidatePersonalValues(queryClient, currentOrg.id, accessBundleId),
    // The service changed under the dialog, so its copy is stale: reload it before the member saves again.
    onError: (error, { accessBundleId }) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        invalidatePersonalValues(queryClient, currentOrg.id, accessBundleId).catch(() => undefined);
      }
    }
  });
};

export const useDeleteAgentVaultPersonalValues = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, serviceId }: TDeleteAgentVaultPersonalValuesDTO) => {
      const { data } = await apiRequest.delete<{ personalValues: TAgentVaultPersonalValues }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/services/${serviceId}/personal-values`
      );
      return data.personalValues;
    },
    onSuccess: (_, { accessBundleId }) =>
      invalidatePersonalValues(queryClient, currentOrg.id, accessBundleId)
  });
};

// Matches every access bundle's skill list, whose rows show each skill's latest version.
const isAccessBundleSkillsKey = (orgId: string) => (query: { queryKey: readonly unknown[] }) => {
  const [, keyOrgId, scope, , leaf] = query.queryKey;
  return keyOrgId === orgId && scope === "access-bundles" && leaf === "skills";
};

const invalidateSkillVersionChange = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  skillId: string
) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.skill(orgId, skillId), exact: true }),
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.skillVersions(orgId, skillId),
      exact: true
    }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.skillLists(orgId) }),
    queryClient.invalidateQueries({ predicate: isAccessBundleSkillsKey(orgId) })
  ]);

export const useCreateAgentVaultSkill = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultSkillDTO) => {
      const { data } = await apiRequest.post<{
        skill: TAgentVaultSkillSummary;
        version: TAgentVaultSkillVersion;
      }>("/api/v1/agent-vault/skills", params);
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.skillLists(currentOrg.id) })
  });
};

/** A save sent with a `baseVersion` that is no longer the latest. The caller shows it, so no toast is raised. */
export class SkillVersionConflictError extends Error {
  latestVersion: number;

  constructor(message: string, latestVersion: number) {
    super(message);
    this.latestVersion = latestVersion;
  }
}

const STALE_BASE_VERSION_RE = /^Version (\d+) was published after you opened this skill\./;

export const useUpdateAgentVaultSkill = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ skillId, ...params }: TUpdateAgentVaultSkillDTO) => {
      try {
        const { data } = await apiRequest.patch<{
          skill: TAgentVaultSkillSummary;
          version: TAgentVaultSkillVersion;
          unchanged: boolean;
        }>(`/api/v1/agent-vault/skills/${skillId}`, params);
        return data;
      } catch (error) {
        const message: unknown = axios.isAxiosError(error)
          ? error.response?.data?.message
          : undefined;
        const match =
          axios.isAxiosError(error) && error.response?.status === 409 && typeof message === "string"
            ? STALE_BASE_VERSION_RE.exec(message)
            : null;
        if (match) throw new SkillVersionConflictError(message as string, Number(match[1]));
        throw error;
      }
    },
    onSuccess: (_, { skillId }) =>
      invalidateSkillVersionChange(queryClient, currentOrg.id, skillId),
    onError: (error, { skillId }) => {
      if (error instanceof SkillVersionConflictError) {
        invalidateSkillVersionChange(queryClient, currentOrg.id, skillId).catch(() => undefined);
      }
    }
  });
};

export const useRestoreAgentVaultSkillVersion = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ skillId, version }: { skillId: string; version: number }) => {
      const { data } = await apiRequest.post<{
        version: TAgentVaultSkillVersion;
        unchanged: boolean;
      }>(`/api/v1/agent-vault/skills/${skillId}/versions/${version}/restore`);
      return data;
    },
    onSuccess: (_, { skillId }) => invalidateSkillVersionChange(queryClient, currentOrg.id, skillId)
  });
};

export const useDeleteAgentVaultSkill = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const { data } = await apiRequest.delete<{ skill: TAgentVaultSkillSummary }>(
        `/api/v1/agent-vault/skills/${skillId}`
      );
      return data.skill;
    },
    // The skill's own queries are dropped rather than invalidated, which would refetch them only to get 404s. A page
    // still showing the skill drops its queries once it has navigated away.
    onSuccess: (_, skillId) => {
      queryClient.removeQueries({
        queryKey: agentVaultKeys.skill(currentOrg.id, skillId),
        type: "inactive"
      });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: agentVaultKeys.skillLists(currentOrg.id) }),
        queryClient.invalidateQueries({ predicate: isAccessBundleSkillsKey(currentOrg.id) })
      ]);
    }
  });
};

const invalidateBundleSkillChange = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  { accessBundleId, skillId }: { accessBundleId: string; skillId: string }
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.accessBundleSkills(orgId, accessBundleId)
    }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.skill(orgId, skillId), exact: true }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.skillLists(orgId) })
  ]);

export const useAddAgentVaultAccessBundleSkill = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      skillId
    }: {
      accessBundleId: string;
      skillId: string;
    }) => {
      const { data } = await apiRequest.post<{ skill: TAgentVaultBundleSkill }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/skills`,
        { skillId }
      );
      return data.skill;
    },
    onSuccess: (_, params) => invalidateBundleSkillChange(queryClient, currentOrg.id, params)
  });
};

export const useRemoveAgentVaultAccessBundleSkill = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      skillId
    }: {
      accessBundleId: string;
      skillId: string;
    }) => {
      const { data } = await apiRequest.delete<{ skill: TAgentVaultBundleSkill }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/skills/${skillId}`
      );
      return data.skill;
    },
    onSuccess: (_, params) => invalidateBundleSkillChange(queryClient, currentOrg.id, params)
  });
};
