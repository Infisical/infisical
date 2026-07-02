import { useCallback, useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  UseQueryOptions
} from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  createResourcePermissionQueryHook,
  ResourcePermissionResponse
} from "@app/helpers/resourcePermissions";

import { PamAccountType, PamResourcePermissionActions, PamResourcePermissionSub } from "./enums";
import {
  PamAccountAccessibilityIssue,
  PamFolderPermissionSet,
  TAccessiblePamAccount,
  TListAccessiblePamAccountsDTO,
  TListPamAccountTemplatesDTO,
  TPamAccessRequest,
  TPamAccount,
  TPamAccountTemplateDetail,
  TPamAccountTemplateWithCount,
  TPamAccountTypeMetadata,
  TPamApprovalConfig,
  TPamFolderWithCount,
  TPamMember,
  TPamMembersData,
  TPamResourceRole,
  TPamSession
} from "./types";

export const pamKeys = {
  all: ["pam"] as const,
  account: () => [...pamKeys.all, "account"] as const,
  session: () => [...pamKeys.all, "session"] as const,
  accessibleFolders: () => [...pamKeys.account(), "accessible-folders"] as const,
  listAccessibleAccounts: (params?: TListAccessiblePamAccountsDTO) =>
    [...pamKeys.account(), "accessible", params] as const,
  getAccount: (accountId: string) => [...pamKeys.account(), "get", accountId] as const,
  getSession: (sessionId: string) => [...pamKeys.session(), "get", sessionId] as const,
  listSessions: (
    projectId: string,
    params?: { offset?: number; limit?: number; search?: string; status?: string }
  ) => [...pamKeys.session(), "list", projectId, params] as const,
  folderPermissions: (folderId: string) =>
    [...pamKeys.all, "folder-permissions", folderId] as const,
  accountPermissions: (accountId: string) =>
    [...pamKeys.all, "account-permissions", accountId] as const,
  template: () => [...pamKeys.all, "template"] as const,
  listTemplates: (params?: TListPamAccountTemplatesDTO) =>
    [...pamKeys.template(), "list", params] as const,
  getTemplate: (templateId: string) => [...pamKeys.template(), "get", templateId] as const,
  folder: () => [...pamKeys.all, "folder"] as const,
  listFolders: (params?: { search?: string }) => [...pamKeys.folder(), "list", params] as const,
  adminListAccounts: (params?: { folderId?: string; templateId?: string; search?: string }) =>
    [...pamKeys.account(), "admin-list", params] as const,
  accountMembers: (accountId: string) => [...pamKeys.all, "account-members", accountId] as const,
  folderMembers: (folderId: string) => [...pamKeys.all, "folder-members", folderId] as const,
  productMembers: () => [...pamKeys.all, "product-members"] as const,
  productGroups: () => [...pamKeys.all, "product-groups"] as const,
  productIdentities: () => [...pamKeys.all, "product-identities"] as const,
  resourceRoles: () => [...pamKeys.all, "resource-roles"] as const,
  accessCapabilities: () => [...pamKeys.all, "access-capabilities"] as const,
  accountTypes: () => [...pamKeys.all, "account-types"] as const,
  accessRequest: () => [...pamKeys.all, "access-request"] as const,
  pendingMyApproval: (params?: { folderId?: string }) =>
    [...pamKeys.accessRequest(), "pending-my-approval", params] as const,
  accessRequestCount: () => [...pamKeys.accessRequest(), "count"] as const,
  listAccessRequests: (params?: {
    folderId?: string;
    status?: string;
    offset?: number;
    limit?: number;
  }) => [...pamKeys.accessRequest(), "list", params] as const,
  approvalConfig: (folderId: string) => [...pamKeys.all, "approval-config", folderId] as const
};

const fetchFolderPermissions = async (folderId: string) => {
  const { data } = await apiRequest.get<{
    data: ResourcePermissionResponse<PamFolderPermissionSet>;
  }>(`/api/v1/pam/folders/${folderId}/permissions`);
  return data.data;
};

export const usePamFolderPermission = createResourcePermissionQueryHook<PamFolderPermissionSet>({
  queryKey: (folderId) => pamKeys.folderPermissions(folderId),
  fetchFn: fetchFolderPermissions
});

const fetchAccountPermissions = async (accountId: string) => {
  const { data } = await apiRequest.get<{
    data: ResourcePermissionResponse<PamFolderPermissionSet>;
  }>(`/api/v1/pam/accounts/${accountId}/permissions`);
  return data.data;
};

export const usePamAccountPermission = createResourcePermissionQueryHook<PamFolderPermissionSet>({
  queryKey: (accountId) => pamKeys.accountPermissions(accountId),
  fetchFn: fetchAccountPermissions
});

export const usePamFolderActions = (folderId: string, enabled = true) => {
  const { data, isLoading } = usePamFolderPermission(folderId, enabled);
  const can = useCallback(
    (action: PamResourcePermissionActions) =>
      data?.permission.can(action, PamResourcePermissionSub.PamResource) ?? false,
    [data]
  );
  return { can, isLoading };
};

export const usePamAccountActions = (accountId: string, enabled = true) => {
  const { data, isLoading } = usePamAccountPermission(accountId, enabled);
  const can = useCallback(
    (action: PamResourcePermissionActions) =>
      data?.permission.can(action, PamResourcePermissionSub.PamResource) ?? false,
    [data]
  );
  return { can, isLoading };
};

// Accessible Accounts (user-facing)
type TListAccessiblePamAccountsResponse = {
  accounts: TAccessiblePamAccount[];
  totalCount: number;
};

const ACCESSIBLE_ACCOUNTS_PAGE_SIZE = 50;

export const useListAccessiblePamAccounts = (
  filters?: Omit<TListAccessiblePamAccountsDTO, "offset" | "limit">,
  options?: { enabled?: boolean }
) => {
  return useInfiniteQuery({
    queryKey: pamKeys.listAccessibleAccounts(filters),
    queryFn: async ({ pageParam = 0 }) => {
      const { data } = await apiRequest.get<TListAccessiblePamAccountsResponse>(
        "/api/v1/pam/accounts/accessible",
        { params: { ...filters, offset: pageParam, limit: ACCESSIBLE_ACCOUNTS_PAGE_SIZE } }
      );
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.accounts.length, 0);
      return fetched < lastPage.totalCount ? fetched : undefined;
    },
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData
  });
};

// Accessible Folders (user-facing)
export type TAccessiblePamFolder = {
  id: string;
  name: string;
  accountCount: number;
};

export const useListAccessiblePamFolders = () => {
  return useQuery({
    queryKey: pamKeys.accessibleFolders(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ folders: TAccessiblePamFolder[] }>(
        "/api/v1/pam/folders",
        { params: { onlyAccessible: "true" } }
      );
      return data.folders;
    }
  });
};

type TAdminListAccountsParams = {
  folderId?: string;
  templateId?: string;
  search?: string;
};

type TAdminAccountListItem = {
  id: string;
  name: string;
  description: string | null;
  folderId: string;
  templateId: string;
  folderName: string | null;
  templateName: string;
  accountType: string;
  gatewayId: string | null;
  gatewayPoolId: string | null;
  recordingConnectionId: string | null;
  isAccessible: boolean;
  accessibilityIssues: PamAccountAccessibilityIssue[];
  createdAt: string;
  updatedAt: string;
};

export const useListPamAccountsAdmin = (
  params?: TAdminListAccountsParams,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: pamKeys.adminListAccounts(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accounts: TAdminAccountListItem[] }>(
        "/api/v1/pam/accounts",
        { params }
      );
      return data.accounts;
    },
    enabled: options?.enabled ?? true,
    placeholderData: (prev) => prev
  });
};

export const useListPamFoldersAdmin = (params?: { search?: string }) => {
  return useQuery({
    queryKey: pamKeys.listFolders(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ folders: TPamFolderWithCount[] }>(
        "/api/v1/pam/folders",
        { params }
      );
      return data.folders;
    }
  });
};

export const useListPamAccountTemplates = (params?: TListPamAccountTemplatesDTO) => {
  return useQuery({
    queryKey: pamKeys.listTemplates(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ templates: TPamAccountTemplateWithCount[] }>(
        "/api/v1/pam/account-templates",
        { params }
      );
      return data.templates;
    }
  });
};

export const useGetPamAccountTemplate = (templateId?: string) => {
  return useQuery({
    queryKey: pamKeys.getTemplate(templateId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ template: TPamAccountTemplateDetail }>(
        `/api/v1/pam/account-templates/${templateId}`
      );
      return data.template;
    },
    enabled: !!templateId
  });
};

export const useGetPamAccountById = (
  accountId?: string,
  options?: Omit<
    UseQueryOptions<TPamAccount, unknown, TPamAccount, ReturnType<typeof pamKeys.getAccount>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.getAccount(accountId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ account: TPamAccount }>(
        `/api/v1/pam/accounts/${accountId}`
      );

      return data.account;
    },
    enabled: !!accountId && (options?.enabled ?? true),
    ...options
  });
};

// Sessions
export const useGetPamSessionById = (
  sessionId: string,
  options?: Omit<
    UseQueryOptions<TPamSession, unknown, TPamSession, ReturnType<typeof pamKeys.getSession>>,
    "queryKey" | "queryFn" | "enabled"
  >
) => {
  return useQuery({
    queryKey: pamKeys.getSession(sessionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ session: TPamSession }>(
        `/api/v1/pam/sessions/${sessionId}`
      );

      return data.session;
    },
    enabled: !!sessionId,
    ...options
  });
};

type TListPamSessionsResponse = {
  sessions: TPamSession[];
  totalCount: number;
};

export const useListPamSessions = (
  projectId: string,
  params?: { offset?: number; limit?: number; search?: string; status?: string }
) => {
  return useQuery({
    queryKey: pamKeys.listSessions(projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListPamSessionsResponse>("/api/v1/pam/sessions", {
        params
      });

      return data;
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev
  });
};

export const useListAccountMembers = (accountId: string) => {
  return useQuery({
    queryKey: pamKeys.accountMembers(accountId),
    queryFn: async (): Promise<TPamMembersData> => {
      const [usersRes, groupsRes, identitiesRes] = await Promise.all([
        apiRequest.get<{ members: TPamMember[] }>(`/api/v1/pam/accounts/${accountId}/users`),
        apiRequest.get<{ members: TPamMember[] }>(`/api/v1/pam/accounts/${accountId}/groups`),
        apiRequest.get<{ members: TPamMember[] }>(`/api/v1/pam/accounts/${accountId}/identities`)
      ]);
      return {
        users: usersRes.data.members,
        groups: groupsRes.data.members,
        identities: identitiesRes.data.members
      };
    },
    enabled: !!accountId
  });
};

export const useListFolderMembers = (folderId: string) => {
  return useQuery({
    queryKey: pamKeys.folderMembers(folderId),
    queryFn: async (): Promise<TPamMembersData> => {
      const [usersRes, groupsRes, identitiesRes] = await Promise.all([
        apiRequest.get<{ members: TPamMember[] }>(`/api/v1/pam/folders/${folderId}/users`),
        apiRequest.get<{ members: TPamMember[] }>(`/api/v1/pam/folders/${folderId}/groups`),
        apiRequest.get<{ members: TPamMember[] }>(`/api/v1/pam/folders/${folderId}/identities`)
      ]);
      return {
        users: usersRes.data.members,
        groups: groupsRes.data.members,
        identities: identitiesRes.data.members
      };
    },
    enabled: !!folderId
  });
};

export const useListPamProductMembers = () => {
  return useQuery({
    queryKey: pamKeys.productMembers(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ members: TPamMember[] }>(
        "/api/v1/pam/memberships/users"
      );
      return data.members;
    }
  });
};

export const useListPamProductGroups = () => {
  return useQuery({
    queryKey: pamKeys.productGroups(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ members: TPamMember[] }>(
        "/api/v1/pam/memberships/groups"
      );
      return data.members;
    }
  });
};

export const useListPamProductIdentities = () => {
  return useQuery({
    queryKey: pamKeys.productIdentities(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ members: TPamMember[] }>(
        "/api/v1/pam/memberships/identities"
      );
      return data.members;
    }
  });
};

export const useListPamResourceRoles = () => {
  return useQuery({
    queryKey: pamKeys.resourceRoles(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ roles: TPamResourceRole[] }>("/api/v1/pam/roles");
      return data.roles;
    },
    staleTime: Infinity
  });
};

export const useListPamAccountTypes = () => {
  return useQuery({
    queryKey: pamKeys.accountTypes(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accountTypes: TPamAccountTypeMetadata[] }>(
        "/api/v1/pam/accounts/types"
      );
      return data.accountTypes;
    },
    staleTime: Infinity
  });
};

// Account type metadata keyed by type for synchronous lookups
export const usePamAccountTypeMap = () => {
  const { data: accountTypes = [], ...rest } = useListPamAccountTypes();
  const map = useMemo(
    () => Object.fromEntries(accountTypes.map((meta) => [meta.type, meta])),
    [accountTypes]
  ) as Partial<Record<PamAccountType, TPamAccountTypeMetadata>>;

  return { map, ...rest };
};

export const useGetPamAccessCapabilities = () => {
  return useQuery({
    queryKey: pamKeys.accessCapabilities(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        isProductAdmin: boolean;
        isResourceAdmin: boolean;
        canViewSessions: boolean;
        canViewAuditLogs: boolean;
      }>("/api/v1/pam/memberships/capabilities");
      return data;
    }
  });
};

// Access Requests / Approvals

export const useListPamPendingMyApproval = (params?: { folderId?: string }) => {
  return useQuery({
    queryKey: pamKeys.pendingMyApproval(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ requests: TPamAccessRequest[] }>(
        "/api/v1/pam/access-requests/pending-my-approval",
        { params }
      );
      return data.requests;
    },
    refetchInterval: 30_000
  });
};

export const useGetPamAccessRequestCount = () => {
  return useQuery({
    queryKey: pamKeys.accessRequestCount(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ pendingCount: number; isApprover: boolean }>(
        "/api/v1/pam/access-requests/count"
      );
      return data;
    },
    refetchInterval: 30_000
  });
};

export const useListPamAccessRequests = (params?: {
  folderId?: string;
  status?: string;
  offset?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: pamKeys.listAccessRequests(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ requests: TPamAccessRequest[]; totalCount: number }>(
        "/api/v1/pam/access-requests",
        { params }
      );
      return data;
    },
    placeholderData: (prev) => prev
  });
};

export const useGetPamApprovalConfig = (folderId: string, enabled = true) => {
  return useQuery({
    queryKey: pamKeys.approvalConfig(folderId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamApprovalConfig>(
        `/api/v1/pam/folders/${folderId}/approval-configuration`
      );
      return data;
    },
    enabled: !!folderId && enabled
  });
};
