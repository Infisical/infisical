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
  TCompleteAgentVaultOauthAuthorizationDTO,
  TCreateAgentVaultAccessBundleDTO,
  TCreateAgentVaultOauthAuthorizationDTO,
  TCreateAgentVaultOauthAuthorizationResponse,
  TCreateAgentVaultServiceDTO,
  TCreateAgentVaultSessionDTO,
  TCreateAgentVaultSkillDTO,
  TCreateAgentVaultVariableDTO,
  TDeleteAgentVaultPersonalValuesDTO,
  TSetAgentVaultPersonalValuesDTO,
  TUpdateAgentVaultAccessBundleDTO,
  TUpdateAgentVaultMemberRolesDTO,
  TUpdateAgentVaultServiceDTO,
  TUpdateAgentVaultSessionLabelDTO,
  TUpdateAgentVaultSessionLogSettingsDTO,
  TUpdateAgentVaultSkillDTO,
  TUpdateAgentVaultVariableDTO
} from "./types";

export const useCreateAgentVaultAccessBundle = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultAccessBundleDTO) => {
      const { data } = await apiRequest.post<{ accessBundle: TAgentVaultAccessBundle }>(
        "/api/v1/agent-vault/access-bundles",
        { ...params, projectId }
      );
      return data.accessBundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
    }
  });
};

export const useUpdateAgentVaultAccessBundle = (projectId: string) => {
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
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, projectId, accessBundleId)
      });
      // A variable's usedByServices names each service's bundle.
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.variables(currentOrg.id, projectId)
      });
      // A skill lists the bundles it is in by name.
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.skills(currentOrg.id, projectId) });
    }
  });
};

export const useDeleteAgentVaultAccessBundle = (projectId: string) => {
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
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessions(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.variables(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.skills(currentOrg.id, projectId) });
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

export const useCreateAgentVaultService = (projectId: string) => {
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
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, projectId, accessBundleId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.variables(currentOrg.id, projectId)
      });
    }
  });
};

export const useUpdateAgentVaultService = (projectId: string) => {
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
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, projectId, accessBundleId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.variables(currentOrg.id, projectId)
      });
    }
  });
};

export const useDeleteAgentVaultService = (projectId: string) => {
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
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, projectId, accessBundleId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.variables(currentOrg.id, projectId)
      });
    }
  });
};

export const useAddAgentVaultAccessBundleMembers = (projectId: string) => {
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
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, projectId, accessBundleId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
    }
  });
};

export const useRevokeAgentVaultAccessBundleMembers = (projectId: string) => {
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
        queryKey: agentVaultKeys.accessBundle(currentOrg.id, projectId, accessBundleId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(currentOrg.id, projectId)
      });
    }
  });
};

export const useCreateAgentVaultSession = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultSessionDTO) => {
      const { data } = await apiRequest.post<{ session: TAgentVaultMintedSession }>(
        "/api/v1/agent-vault/sessions",
        { ...params, projectId }
      );
      return data.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessions(currentOrg.id, projectId)
      });
    }
  });
};

export const useUpdateAgentVaultSessionLabel = (projectId: string) => {
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
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessions(currentOrg.id, projectId)
      });
    }
  });
};

export const useRevokeAgentVaultSession = (projectId: string) => {
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
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessions(currentOrg.id, projectId)
      });
    }
  });
};

export const useCreateAgentVaultProxy = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TAgentVaultProxySettingsDTO) => {
      const { data } = await apiRequest.post<TAgentVaultProxyWithToken>(
        "/api/v1/agent-vault/proxies",
        { ...params, projectId }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id, projectId) });
    }
  });
};

export const useUpdateAgentVaultProxy = (projectId: string) => {
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id, projectId) });
    }
  });
};

export const useDeleteAgentVaultProxy = (projectId: string) => {
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id, projectId) });
    }
  });
};

export const useRotateAgentVaultProxyToken = (projectId: string) => {
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id, projectId) });
    }
  });
};

export const useRevokeAgentVaultProxyAccess = (projectId: string) => {
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
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies(currentOrg.id, projectId) });
    }
  });
};

// Removing a product member strips their bundle grants, so the bundle queries go too.
const invalidateMembers = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string
) => {
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(orgId, projectId) });
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId, projectId) });
};

export const useAddAgentVaultMembers = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TAddAgentVaultProductMembersDTO) => {
      const { data } = await apiRequest.post<
        TAgentVaultMemberWriteResult<
          TAgentVaultWrittenMember,
          TAgentVaultActorRef & { identifier: string }
        >
      >("/api/v1/agent-vault/members", { ...dto, projectId });
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id, projectId)
  });
};

export const useUpdateAgentVaultMemberRoles = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TUpdateAgentVaultMemberRolesDTO) => {
      const { data } = await apiRequest.patch<
        TAgentVaultMemberWriteResult<TAgentVaultWrittenMember>
      >("/api/v1/agent-vault/members", { ...dto, projectId });
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id, projectId)
  });
};

export const useRevokeAgentVaultMembers = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TAgentVaultActorIdsDTO) => {
      const { data } = await apiRequest.delete<TAgentVaultMemberWriteResult<TAgentVaultActorRef>>(
        "/api/v1/agent-vault/members",
        { data: { ...dto, projectId } }
      );
      return data;
    },
    onSuccess: () => invalidateMembers(queryClient, currentOrg.id, projectId)
  });
};

export const useUpdateAgentVaultSessionLogSettings = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: TUpdateAgentVaultSessionLogSettingsDTO) => {
      const { data } = await apiRequest.patch<TAgentVaultSessionLogSettingsState>(
        "/api/v1/agent-vault/settings/session-logs",
        params,
        { params: { projectId } }
      );
      return data;
    },
    onSuccess: (state) => {
      queryClient.setQueryData(agentVaultKeys.sessionLogSettings(currentOrg.id, projectId), state);
      // Reset, not invalidate: the cached result may be for the previous bucket.
      queryClient.resetQueries({
        queryKey: agentVaultKeys.sessionLogCorsProbe(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessionLogHealth(currentOrg.id, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessions(currentOrg.id, projectId)
      });
    }
  });
};

// A rename changes the keys each service's variableReferences, and each personal value's, reports, so those refresh
// too.
const invalidateVariables = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string
) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(orgId, projectId) }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId, projectId) })
  ]);

export const useCreateAgentVaultVariable = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultVariableDTO) => {
      const { data } = await apiRequest.post<{ variable: TAgentVaultVariable }>(
        "/api/v1/agent-vault/variables",
        { ...params, projectId }
      );
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, currentOrg.id, projectId)
  });
};

export const useUpdateAgentVaultVariable = (projectId: string) => {
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
    onSuccess: () => invalidateVariables(queryClient, currentOrg.id, projectId)
  });
};

export const useDeleteAgentVaultVariable = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variableId: string) => {
      const { data } = await apiRequest.delete<{ variable: TAgentVaultVariable }>(
        `/api/v1/agent-vault/variables/${variableId}`
      );
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, currentOrg.id, projectId)
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

export const useCreateAgentVaultOauthAuthorization = (projectId: string) =>
  useMutation({
    // The Authorize card shows every failure in place, discovery and registration ones naming the server.
    meta: { skipErrorToast: true },
    mutationFn: async (params: TCreateAgentVaultOauthAuthorizationDTO) => {
      const { data } = await apiRequest.post<TCreateAgentVaultOauthAuthorizationResponse>(
        "/api/v1/agent-vault/oauth/authorizations",
        { ...params, projectId }
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
  projectId: string,
  accessBundleId: string
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.accessBundle(orgId, projectId, accessBundleId)
    }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId, projectId) }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.variables(orgId, projectId) })
  ]);

export const useSetAgentVaultPersonalValues = (projectId: string) => {
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
      invalidatePersonalValues(queryClient, currentOrg.id, projectId, accessBundleId),
    // The service changed under the dialog, so its copy is stale: reload it before the member saves again.
    onError: (error, { accessBundleId }) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        invalidatePersonalValues(queryClient, currentOrg.id, projectId, accessBundleId).catch(
          () => undefined
        );
      }
    }
  });
};

export const useDeleteAgentVaultPersonalValues = (projectId: string) => {
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
      invalidatePersonalValues(queryClient, currentOrg.id, projectId, accessBundleId)
  });
};

// Matches every access bundle's skill list, whose rows show each skill's latest version.
const isAccessBundleSkillsKey =
  (orgId: string, projectId: string) => (query: { queryKey: readonly unknown[] }) => {
    const [, keyOrgId, keyProjectId, scope, , leaf] = query.queryKey;
    return (
      keyOrgId === orgId &&
      keyProjectId === projectId &&
      scope === "access-bundles" &&
      leaf === "skills"
    );
  };

const invalidateSkillVersionChange = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string,
  skillId: string
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.skill(orgId, projectId, skillId),
      exact: true
    }),
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.skillVersions(orgId, projectId, skillId),
      exact: true
    }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.skillLists(orgId, projectId) }),
    queryClient.invalidateQueries({ predicate: isAccessBundleSkillsKey(orgId, projectId) })
  ]);

export const useCreateAgentVaultSkill = (projectId: string) => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultSkillDTO) => {
      const { data } = await apiRequest.post<{
        skill: TAgentVaultSkillSummary;
        version: TAgentVaultSkillVersion;
      }>("/api/v1/agent-vault/skills", { ...params, projectId });
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.skillLists(currentOrg.id, projectId)
      })
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

export const useUpdateAgentVaultSkill = (projectId: string) => {
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
      invalidateSkillVersionChange(queryClient, currentOrg.id, projectId, skillId),
    onError: (error, { skillId }) => {
      if (error instanceof SkillVersionConflictError) {
        invalidateSkillVersionChange(queryClient, currentOrg.id, projectId, skillId).catch(
          () => undefined
        );
      }
    }
  });
};

export const useRestoreAgentVaultSkillVersion = (projectId: string) => {
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
    onSuccess: (_, { skillId }) =>
      invalidateSkillVersionChange(queryClient, currentOrg.id, projectId, skillId)
  });
};

export const useDeleteAgentVaultSkill = (projectId: string) => {
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
        queryKey: agentVaultKeys.skill(currentOrg.id, projectId, skillId),
        type: "inactive"
      });
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: agentVaultKeys.skillLists(currentOrg.id, projectId)
        }),
        queryClient.invalidateQueries({
          predicate: isAccessBundleSkillsKey(currentOrg.id, projectId)
        })
      ]);
    }
  });
};

const invalidateBundleSkillChange = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string,
  { accessBundleId, skillId }: { accessBundleId: string; skillId: string }
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.accessBundleSkills(orgId, projectId, accessBundleId)
    }),
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.skill(orgId, projectId, skillId),
      exact: true
    }),
    queryClient.invalidateQueries({ queryKey: agentVaultKeys.skillLists(orgId, projectId) })
  ]);

export const useAddAgentVaultAccessBundleSkill = (projectId: string) => {
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
    onSuccess: (_, params) =>
      invalidateBundleSkillChange(queryClient, currentOrg.id, projectId, params)
  });
};

export const useRemoveAgentVaultAccessBundleSkill = (projectId: string) => {
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
    onSuccess: (_, params) =>
      invalidateBundleSkillChange(queryClient, currentOrg.id, projectId, params)
  });
};
