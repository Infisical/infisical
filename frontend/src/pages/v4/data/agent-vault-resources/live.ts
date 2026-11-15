import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import axios from "axios";

import { apiRequest } from "@app/config/request";
import { VARIABLE_KEY_MAX_LENGTH, VARIABLE_KEY_RE } from "@app/helpers/agentVaultVariables";
import { AgentVaultVariableScope } from "@app/hooks/api/agentVault/enums";
import { SkillVersionConflictError } from "@app/hooks/api/agentVault/mutations";
import {
  agentVaultKeys,
  fetchAgentVaultProxyCa,
  fetchAgentVaultSkillVersion,
  type TAgentVaultProxyList
} from "@app/hooks/api/agentVault/queries";
import type {
  TAddAgentVaultMembersDTO,
  TAgentVaultAccessBundle,
  TAgentVaultAccessBundleDetails,
  TAgentVaultAccessBundleListItem,
  TAgentVaultActorRef,
  TAgentVaultBundleSkill,
  TAgentVaultGrantedMember,
  TAgentVaultMcpTool,
  TAgentVaultMember,
  TAgentVaultMemberWriteResult,
  TAgentVaultPersonalValues,
  TAgentVaultProductMember,
  TAgentVaultProjectService,
  TAgentVaultProxy,
  TAgentVaultProxyWithToken,
  TAgentVaultSkillDetail,
  TAgentVaultSkillPage,
  TAgentVaultSkillSummary,
  TAgentVaultSkillVersion,
  TAgentVaultSkippedBundleItem,
  TAgentVaultVariable,
  TCreateAgentVaultAccessBundleDTO,
  TCreateAgentVaultProxyDTO,
  TCreateAgentVaultServiceDTO,
  TCreateAgentVaultSkillDTO,
  TCreateAgentVaultVariableDTO,
  TDeleteAgentVaultPersonalValuesDTO,
  TListAgentVaultAccessBundlesDTO,
  TListAgentVaultMcpToolsDTO,
  TListAgentVaultMembersDTO,
  TListAgentVaultProxiesDTO,
  TListAgentVaultServicesDTO,
  TListAgentVaultSkillsDTO,
  TListAgentVaultVariablesDTO,
  TSetAgentVaultPersonalValuesDTO,
  TUpdateAgentVaultAccessBundleDTO,
  TUpdateAgentVaultProxyDTO,
  TUpdateAgentVaultServiceDTO,
  TUpdateAgentVaultSkillDTO,
  TUpdateAgentVaultVariableDTO
} from "@app/hooks/api/agentVault/types";

import type { AgentVaultResourcesAdapter } from "./contract";

// Main's hooks read the org from its own layout's route context, which v4 doesn't mount, so these are main's
// hooks with the org taken from the v4 route instead. Keys match main's, so both apps share one cache.
const useOrgId = () => useParams({ from: "/v4/organizations/$orgId" }).orgId;

type TAgentVaultAccessBundleList = {
  accessBundles: TAgentVaultAccessBundleListItem[];
  totalCount: number;
};

type TAgentVaultVariablePage = {
  variables: TAgentVaultVariable[];
  totalCount: number;
};

// Keeps the previous page up while new parameters load, but never across projects.
const keepPreviousInProject =
  (projectId: string) =>
  <T>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }) =>
    prevQuery?.queryKey[2] === projectId ? prev : undefined;

const useListAgentVaultAccessBundleMembers = (
  projectId: string,
  accessBundleId: string,
  params: TListAgentVaultMembersDTO = {}
) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.accessBundleMemberList(orgId, projectId, accessBundleId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        members: TAgentVaultMember[];
        totalCount: number;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/members`, {
        params
      });
      return data;
    },
    enabled: Boolean(accessBundleId),
    placeholderData: keepPreviousInProject(projectId)
  });
};

// One page is enough for a picker: past it the admin searches. The default lives here so both add
// dialogs page the same way.
const AVAILABLE_MEMBER_LIMIT = 50;

const useListAvailableAgentVaultAccessBundleMembers = (
  projectId: string,
  accessBundleId: string,
  { limit = AVAILABLE_MEMBER_LIMIT, ...rest }: TListAgentVaultMembersDTO = {},
  enabled = true
) => {
  const orgId = useOrgId();
  const params = { ...rest, limit };

  return useQuery({
    queryKey: agentVaultKeys.availableAccessBundleMemberList(
      orgId,
      projectId,
      accessBundleId,
      params
    ),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        members: TAgentVaultProductMember[];
        totalCount: number;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/members/available`, { params });
      return data;
    },
    enabled: enabled && Boolean(accessBundleId),
    placeholderData: keepPreviousInProject(projectId)
  });
};

const useListAgentVaultAccessBundles = (
  projectId: string,
  params: TListAgentVaultAccessBundlesDTO = {},
  options?: Omit<UseQueryOptions<TAgentVaultAccessBundleList>, "queryKey" | "queryFn">
) => {
  const orgId = useOrgId();

  return useQuery({
    placeholderData: keepPreviousInProject(projectId),
    ...options,
    queryKey: agentVaultKeys.accessBundleList(orgId, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultAccessBundleList>(
        "/api/v1/agent-vault/access-bundles",
        { params: { ...params, projectId } }
      );
      return data;
    }
  });
};

const useGetAgentVaultAccessBundle = (projectId: string, accessBundleId: string) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.accessBundle(orgId, projectId, accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        accessBundle: TAgentVaultAccessBundleDetails;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}`);
      return data.accessBundle;
    },
    enabled: Boolean(accessBundleId)
  });
};

const useListAgentVaultProxies = (
  projectId: string,
  params: TListAgentVaultProxiesDTO = {},
  options?: Omit<UseQueryOptions<TAgentVaultProxyList>, "queryKey" | "queryFn">
) => {
  const orgId = useOrgId();

  return useQuery({
    refetchInterval: 30_000,
    placeholderData: keepPreviousInProject(projectId),
    ...options,
    queryKey: agentVaultKeys.proxyList(orgId, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultProxyList>("/api/v1/agent-vault/proxies", {
        params: { ...params, projectId }
      });
      return data;
    }
  });
};

const fetchAgentVaultVariables = async (
  projectId: string,
  { keys, ...params }: TListAgentVaultVariablesDTO
) => {
  const { data } = await apiRequest.get<TAgentVaultVariablePage>("/api/v1/agent-vault/variables", {
    params: { ...params, projectId, keys: keys?.join(",") }
  });
  return data;
};

const useListAgentVaultVariables = (
  projectId: string,
  params: TListAgentVaultVariablesDTO = {},
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.variableList(orgId, projectId, params),
    queryFn: () => fetchAgentVaultVariables(projectId, params),
    placeholderData: keepPreviousInProject(projectId),
    enabled
  });
};

const KEY_LOOKUP_BATCH_SIZE = 100;

// The API refuses a whole batch that holds one key it would never accept, so such a key isn't sent. No variable can
// have it, so it counts as missing, as the API says on save.
const isPossibleVariableKey = (key: string) =>
  key.length <= VARIABLE_KEY_MAX_LENGTH && VARIABLE_KEY_RE.test(key);

// Whether each key exists, asked through the keys filter in one request per 100 keys. Asked again on window focus
// and whenever the variables are invalidated, since another admin may create or delete one at any time. A key is in
// neither set until an answer that asked about it arrives; the previous answer stays up meanwhile, so a key it
// already covered doesn't flicker while the next set loads.
const useAgentVaultVariableKeyStatus = (
  projectId: string,
  keys: readonly string[],
  {
    enabled = true,
    isCached = true,
    scope = AgentVaultVariableScope.Global
  }: {
    enabled?: boolean;
    isCached?: boolean;
    scope?: AgentVaultVariableScope;
  } = {}
) => {
  const orgId = useOrgId();
  const possibleKeys = [...new Set(keys.filter(isPossibleVariableKey))].sort();

  const { data } = useQuery({
    queryKey: agentVaultKeys.variableKeyStatus(orgId, projectId, scope, possibleKeys),
    queryFn: async () => {
      const found: string[] = [];
      for (let i = 0; i < possibleKeys.length; i += KEY_LOOKUP_BATCH_SIZE) {
        // eslint-disable-next-line no-await-in-loop
        const page = await fetchAgentVaultVariables(projectId, {
          scope,
          keys: possibleKeys.slice(i, i + KEY_LOOKUP_BATCH_SIZE)
        });
        found.push(...page.variables.map((variable) => variable.key));
      }
      return { asked: possibleKeys, found };
    },
    enabled: enabled && possibleKeys.length > 0,
    placeholderData: keepPreviousInProject(projectId),
    refetchOnWindowFocus: true,
    staleTime: 0,
    ...(isCached ? {} : { gcTime: 0 })
  });

  const keySignature = keys.join(",");
  return useMemo(() => {
    const asked = new Set(data?.asked);
    const found = new Set(data?.found);
    const current = keySignature ? keySignature.split(",") : [];
    return {
      existing: new Set(current.filter((key) => found.has(key))) as ReadonlySet<string>,
      missing: new Set(
        current.filter((key) => !isPossibleVariableKey(key) || (asked.has(key) && !found.has(key)))
      ) as ReadonlySet<string>
    };
  }, [data, keySignature]);
};

const useListAgentVaultServices = (
  projectId: string,
  params: TListAgentVaultServicesDTO = {},
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.serviceList(orgId, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        services: TAgentVaultProjectService[];
        totalCount: number;
      }>("/api/v1/agent-vault/services", { params: { ...params, projectId } });
      return data;
    },
    placeholderData: keepPreviousInProject(projectId),
    enabled
  });
};

const useListAgentVaultSkills = (
  projectId: string,
  params: TListAgentVaultSkillsDTO = {},
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.skillList(orgId, projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAgentVaultSkillPage>("/api/v1/agent-vault/skills", {
        params: { ...params, projectId }
      });
      return data;
    },
    placeholderData: keepPreviousInProject(projectId),
    enabled
  });
};

const useGetAgentVaultSkill = (projectId: string, skillId: string) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.skill(orgId, projectId, skillId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ skill: TAgentVaultSkillDetail }>(
        `/api/v1/agent-vault/skills/${skillId}`
      );
      return data.skill;
    },
    enabled: Boolean(skillId)
  });
};

const useListAgentVaultSkillVersions = (projectId: string, skillId: string) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.skillVersions(orgId, projectId, skillId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        versions: TAgentVaultSkillVersion[];
      }>(`/api/v1/agent-vault/skills/${skillId}/versions`);
      return data.versions;
    },
    enabled: Boolean(skillId)
  });
};

const useGetAgentVaultSkillVersion = (projectId: string, skillId: string, version?: number) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.skillVersion(orgId, projectId, skillId, version ?? 0),
    queryFn: () => fetchAgentVaultSkillVersion(skillId, version ?? 0),
    enabled: Boolean(skillId) && Boolean(version),
    // A version never changes once published.
    staleTime: Infinity
  });
};

const useListAgentVaultAccessBundleSkills = (
  projectId: string,
  accessBundleId: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const orgId = useOrgId();

  return useQuery({
    queryKey: agentVaultKeys.accessBundleSkills(orgId, projectId, accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        skills: TAgentVaultBundleSkill[];
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/skills`);
      return data.skills;
    },
    enabled: enabled && Boolean(accessBundleId)
  });
};

const useCreateAgentVaultAccessBundle = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultAccessBundleDTO) => {
      const { data } = await apiRequest.post<{
        accessBundle: TAgentVaultAccessBundle;
      }>("/api/v1/agent-vault/access-bundles", { ...params, projectId });
      return data.accessBundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(orgId, projectId)
      });
    }
  });
};

const useUpdateAgentVaultAccessBundle = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TUpdateAgentVaultAccessBundleDTO) => {
      const { data } = await apiRequest.patch<{
        accessBundle: TAgentVaultAccessBundle;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}`, params);
      return data.accessBundle;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(orgId, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundle(orgId, projectId, accessBundleId)
      });
      // A variable's usedByServices names each service's bundle.
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.variables(orgId, projectId)
      });
      // A skill lists the bundles it is in by name, and so does a service.
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.skills(orgId, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.services(orgId, projectId)
      });
    }
  });
};

const useDeleteAgentVaultAccessBundle = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accessBundleId: string) => {
      const { data } = await apiRequest.delete<{
        accessBundle: TAgentVaultAccessBundle;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}`);
      return data.accessBundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(orgId, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.sessions(orgId, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.variables(orgId, projectId)
      });
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.skills(orgId, projectId)
      });
      // The services it held list it, and the sidebar's setup count covers it.
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.services(orgId, projectId)
      });
    }
  });
};

// A service can be in any number of bundles, so a change to one refreshes every bundle, the service lists and the
// variables whose Used By names it.
const invalidateServices = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.services(orgId, projectId)
    }),
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.accessBundles(orgId, projectId)
    }),
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.variables(orgId, projectId)
    })
  ]);

const useCreateAgentVaultService = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultServiceDTO) => {
      const { data } = await apiRequest.post<{
        service: TAgentVaultProjectService;
      }>("/api/v1/agent-vault/services", { ...params, projectId });
      return data;
    },
    onSuccess: () => invalidateServices(queryClient, orgId, projectId)
  });
};

const useUpdateAgentVaultService = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, ...params }: TUpdateAgentVaultServiceDTO) => {
      const { data } = await apiRequest.patch<{
        service: TAgentVaultProjectService;
      }>(`/api/v1/agent-vault/services/${serviceId}`, params);
      return data;
    },
    onSuccess: () => invalidateServices(queryClient, orgId, projectId)
  });
};

const useDeleteAgentVaultService = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId }: { serviceId: string }) => {
      const { data } = await apiRequest.delete<{
        service: TAgentVaultProjectService;
      }>(`/api/v1/agent-vault/services/${serviceId}`);
      return data.service;
    },
    onSuccess: () => invalidateServices(queryClient, orgId, projectId)
  });
};

const useAddAgentVaultAccessBundleService = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      serviceIds
    }: {
      accessBundleId: string;
      serviceIds: string[];
    }) => {
      const { data } = await apiRequest.post<{
        services: TAgentVaultProjectService[];
        skipped: TAgentVaultSkippedBundleItem[];
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/services`, {
        serviceIds
      });
      return data;
    },
    onSuccess: () => invalidateServices(queryClient, orgId, projectId)
  });
};

const useRemoveAgentVaultAccessBundleService = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      serviceId
    }: {
      accessBundleId: string;
      serviceId: string;
    }) => {
      const { data } = await apiRequest.delete<{
        service: TAgentVaultProjectService;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/services/${serviceId}`);
      return data.service;
    },
    onSuccess: () => invalidateServices(queryClient, orgId, projectId)
  });
};

const useAddAgentVaultAccessBundleMembers = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMembersDTO) => {
      const { data } = await apiRequest.post<
        TAgentVaultMemberWriteResult<TAgentVaultGrantedMember>
      >(`/api/v1/agent-vault/access-bundles/${accessBundleId}/members`, params);
      return data;
    },
    // accessBundles() prefixes accessBundle(), so it covers the bundle's members too. Invalidating
    // both would refetch them twice, since the member check can't be cancelled midway.
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(orgId, projectId)
      });
      // A grant changes which services the caller reaches and the bundles listed beside each one.
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.services(orgId, projectId)
      });
    }
  });
};

const useRevokeAgentVaultAccessBundleMembers = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMembersDTO) => {
      const { data } = await apiRequest.delete<TAgentVaultMemberWriteResult<TAgentVaultActorRef>>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`,
        {
          data: params
        }
      );
      return data;
    },
    // accessBundles() prefixes accessBundle(), so it covers the bundle's members too. Invalidating
    // both would refetch them twice, since the member check can't be cancelled midway.
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.accessBundles(orgId, projectId)
      });
      // A grant changes which services the caller reaches and the bundles listed beside each one.
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.services(orgId, projectId)
      });
    }
  });
};

const useCreateAgentVaultProxy = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultProxyDTO) => {
      const { data } = await apiRequest.post<TAgentVaultProxyWithToken>(
        "/api/v1/agent-vault/proxies",
        { ...params, projectId }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.proxies(orgId, projectId)
      });
    }
  });
};

const useUpdateAgentVaultProxy = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proxyId, ...params }: TUpdateAgentVaultProxyDTO) => {
      const { data } = await apiRequest.patch<{ proxy: TAgentVaultProxy }>(
        `/api/v1/agent-vault/proxies/${proxyId}`,
        params
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.proxies(orgId, projectId)
      });
    }
  });
};

const useDeleteAgentVaultProxy = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.delete<{
        proxy: { id: string; name: string };
      }>(`/api/v1/agent-vault/proxies/${proxyId}`);
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.proxies(orgId, projectId)
      });
    }
  });
};

const useRotateAgentVaultProxyToken = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.post<TAgentVaultProxyWithToken>(
        `/api/v1/agent-vault/proxies/${proxyId}/token-auth/proxy-token`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.proxies(orgId, projectId)
      });
    }
  });
};

const useRevokeAgentVaultProxyAccess = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.post<{ proxy: TAgentVaultProxy }>(
        `/api/v1/agent-vault/proxies/${proxyId}/revoke`
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.proxies(orgId, projectId)
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
) => invalidateServices(queryClient, orgId, projectId);

const useCreateAgentVaultVariable = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultVariableDTO) => {
      const { data } = await apiRequest.post<{ variable: TAgentVaultVariable }>(
        "/api/v1/agent-vault/variables",
        { ...params, projectId }
      );
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, orgId, projectId)
  });
};

const useUpdateAgentVaultVariable = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ variableId, ...params }: TUpdateAgentVaultVariableDTO) => {
      const { data } = await apiRequest.patch<{
        variable: TAgentVaultVariable;
      }>(`/api/v1/agent-vault/variables/${variableId}`, params);
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, orgId, projectId)
  });
};

const useDeleteAgentVaultVariable = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variableId: string) => {
      const { data } = await apiRequest.delete<{
        variable: TAgentVaultVariable;
      }>(`/api/v1/agent-vault/variables/${variableId}`);
      return data.variable;
    },
    onSuccess: () => invalidateVariables(queryClient, orgId, projectId)
  });
};

// A read, but its body can carry a credential, and it only runs when the admin asks.
const useListAgentVaultMcpTools = () =>
  useMutation({
    mutationFn: async (params: TListAgentVaultMcpToolsDTO) => {
      const { data } = await apiRequest.post<{ tools: TAgentVaultMcpTool[] }>(
        "/api/v1/agent-vault/services/mcp-tools/list",
        params
      );
      return data.tools;
    }
  });

// The status shows on bundle and service reads and the bundle list, and Used By on personal variables follows the
// references.
const invalidatePersonalValues = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string
) => invalidateServices(queryClient, orgId, projectId);

// The service changed under the dialog, so its copy is stale: reload it before the member saves again.
const reloadPersonalValuesOnConflict = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string,
  error: unknown
) => {
  if (axios.isAxiosError(error) && error.response?.status === 409) {
    invalidatePersonalValues(queryClient, orgId, projectId);
  }
};

const useSetAgentVaultPersonalValues = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, ...params }: TSetAgentVaultPersonalValuesDTO) => {
      const { data } = await apiRequest.patch<{
        personalValues: TAgentVaultPersonalValues;
      }>(`/api/v1/agent-vault/services/${serviceId}/personal-values`, params);
      return data.personalValues;
    },
    onSuccess: () => invalidatePersonalValues(queryClient, orgId, projectId),
    onError: (error) => reloadPersonalValuesOnConflict(queryClient, orgId, projectId, error)
  });
};

const useDeleteAgentVaultPersonalValues = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId }: TDeleteAgentVaultPersonalValuesDTO) => {
      const { data } = await apiRequest.delete<{
        personalValues: TAgentVaultPersonalValues;
      }>(`/api/v1/agent-vault/services/${serviceId}/personal-values`);
      return data.personalValues;
    },
    onSuccess: () => invalidatePersonalValues(queryClient, orgId, projectId)
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
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.skillLists(orgId, projectId)
    }),
    queryClient.invalidateQueries({
      predicate: isAccessBundleSkillsKey(orgId, projectId)
    })
  ]);

const useCreateAgentVaultSkill = (projectId: string) => {
  const orgId = useOrgId();
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
        queryKey: agentVaultKeys.skillLists(orgId, projectId)
      })
  });
};

const STALE_BASE_VERSION_RE = /^Version (\d+) was published after you opened this skill\./;

const useUpdateAgentVaultSkill = (projectId: string) => {
  const orgId = useOrgId();
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
      invalidateSkillVersionChange(queryClient, orgId, projectId, skillId),
    onError: (error, { skillId }) => {
      if (error instanceof SkillVersionConflictError) {
        invalidateSkillVersionChange(queryClient, orgId, projectId, skillId);
      }
    }
  });
};

const useRestoreAgentVaultSkillVersion = (projectId: string) => {
  const orgId = useOrgId();
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
      invalidateSkillVersionChange(queryClient, orgId, projectId, skillId)
  });
};

const useDeleteAgentVaultSkill = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const { data } = await apiRequest.delete<{
        skill: TAgentVaultSkillSummary;
      }>(`/api/v1/agent-vault/skills/${skillId}`);
      return data.skill;
    },
    // The skill's own queries are dropped rather than invalidated, which would refetch them only to get 404s. A page
    // still showing the skill drops its queries once it has navigated away.
    onSuccess: (_, skillId) => {
      queryClient.removeQueries({
        queryKey: agentVaultKeys.skill(orgId, projectId, skillId),
        type: "inactive"
      });
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: agentVaultKeys.skillLists(orgId, projectId)
        }),
        queryClient.invalidateQueries({
          predicate: isAccessBundleSkillsKey(orgId, projectId)
        })
      ]);
    }
  });
};

const invalidateBundleSkillChange = (
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string,
  { accessBundleId, skillIds }: { accessBundleId: string; skillIds: string[] }
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.accessBundleSkills(orgId, projectId, accessBundleId)
    }),
    ...skillIds.map((skillId) =>
      queryClient.invalidateQueries({
        queryKey: agentVaultKeys.skill(orgId, projectId, skillId),
        exact: true
      })
    ),
    queryClient.invalidateQueries({
      queryKey: agentVaultKeys.skillLists(orgId, projectId)
    })
  ]);

const useAddAgentVaultAccessBundleSkill = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      skillIds
    }: {
      accessBundleId: string;
      skillIds: string[];
    }) => {
      const { data } = await apiRequest.post<{
        skills: TAgentVaultBundleSkill[];
        skipped: TAgentVaultSkippedBundleItem[];
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/skills`, {
        skillIds
      });
      return data;
    },
    onSuccess: (_, params) => invalidateBundleSkillChange(queryClient, orgId, projectId, params)
  });
};

const useRemoveAgentVaultAccessBundleSkill = (projectId: string) => {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      skillId
    }: {
      accessBundleId: string;
      skillId: string;
    }) => {
      const { data } = await apiRequest.delete<{
        skill: TAgentVaultBundleSkill;
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/skills/${skillId}`);
      return data.skill;
    },
    onSuccess: (_, { accessBundleId, skillId }) =>
      invalidateBundleSkillChange(queryClient, orgId, projectId, {
        accessBundleId,
        skillIds: [skillId]
      })
  });
};

export const agentVaultResourcesLive: AgentVaultResourcesAdapter = {
  useAccessBundles: useListAgentVaultAccessBundles,
  useAccessBundle: useGetAgentVaultAccessBundle,
  useCreateAccessBundle: useCreateAgentVaultAccessBundle,
  useUpdateAccessBundle: useUpdateAgentVaultAccessBundle,
  useDeleteAccessBundle: useDeleteAgentVaultAccessBundle,
  useAccessBundleMembers: useListAgentVaultAccessBundleMembers,
  useAvailableAccessBundleMembers: useListAvailableAgentVaultAccessBundleMembers,
  useAddAccessBundleMembers: useAddAgentVaultAccessBundleMembers,
  useRevokeAccessBundleMembers: useRevokeAgentVaultAccessBundleMembers,

  useServices: useListAgentVaultServices,
  useCreateService: useCreateAgentVaultService,
  useUpdateService: useUpdateAgentVaultService,
  useDeleteService: useDeleteAgentVaultService,
  useAddAccessBundleServices: useAddAgentVaultAccessBundleService,
  useRemoveAccessBundleService: useRemoveAgentVaultAccessBundleService,
  useListMcpTools: useListAgentVaultMcpTools,
  useSetPersonalValues: useSetAgentVaultPersonalValues,
  useDeletePersonalValues: useDeleteAgentVaultPersonalValues,

  useVariables: useListAgentVaultVariables,
  useVariableKeyStatus: useAgentVaultVariableKeyStatus,
  useCreateVariable: useCreateAgentVaultVariable,
  useUpdateVariable: useUpdateAgentVaultVariable,
  useDeleteVariable: useDeleteAgentVaultVariable,
  useRevealVariableValue: () =>
    useMutation({
      mutationFn: async (variableId: string) => {
        const { data } = await apiRequest.get<{ value: string }>(
          `/api/v1/agent-vault/variables/${variableId}/value`
        );
        return data.value;
      }
    }),

  useSkills: useListAgentVaultSkills,
  useSkill: useGetAgentVaultSkill,
  useSkillVersions: useListAgentVaultSkillVersions,
  useSkillVersion: useGetAgentVaultSkillVersion,
  useAccessBundleSkills: useListAgentVaultAccessBundleSkills,
  useCreateSkill: useCreateAgentVaultSkill,
  useUpdateSkill: useUpdateAgentVaultSkill,
  useRestoreSkillVersion: useRestoreAgentVaultSkillVersion,
  useDeleteSkill: useDeleteAgentVaultSkill,
  useAddAccessBundleSkills: useAddAgentVaultAccessBundleSkill,
  useRemoveAccessBundleSkill: useRemoveAgentVaultAccessBundleSkill,

  useProxies: useListAgentVaultProxies,
  useCreateProxy: useCreateAgentVaultProxy,
  useUpdateProxy: useUpdateAgentVaultProxy,
  useDeleteProxy: useDeleteAgentVaultProxy,
  useRotateProxyToken: useRotateAgentVaultProxyToken,
  useRevokeProxyAccess: useRevokeAgentVaultProxyAccess,
  useProxyCa: () => useMutation({ mutationFn: fetchAgentVaultProxyCa })
};
