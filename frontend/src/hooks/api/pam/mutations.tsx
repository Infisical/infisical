import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { projectKeys } from "@app/hooks/api/projects/query-keys";

import { pamKeys } from "./queries";
import {
  TAddAccountGroupMemberDTO,
  TAddAccountIdentityMemberDTO,
  TAddAccountUserMemberDTO,
  TAddFolderGroupMemberDTO,
  TAddFolderIdentityMemberDTO,
  TAddFolderUserMemberDTO,
  TAddPamProductGroupMemberDTO,
  TAddPamProductIdentityMemberDTO,
  TAddPamProductUserMemberDTO,
  TCreatePamAccessRequestDTO,
  TCreatePamAccountDTO,
  TCreatePamAccountTemplateDTO,
  TCreatePamDiscoverySourceDTO,
  TCreatePamFolderDTO,
  TDeletePamAccountDTO,
  TDeletePamAccountTemplateDTO,
  TDeletePamDiscoverySourceDTO,
  TDeletePamFolderDTO,
  TImportPamDiscoveredAccountResult,
  TImportPamDiscoveredAccountsDTO,
  TPamAccessResponse,
  TPamAccountTemplate,
  TPamDiscoverySource,
  TPamFolder,
  TPamSession,
  TRemoveAccountGroupMemberDTO,
  TRemoveAccountIdentityMemberDTO,
  TRemoveAccountMemberDTO,
  TRemoveFolderGroupMemberDTO,
  TRemoveFolderIdentityMemberDTO,
  TRemoveFolderMemberDTO,
  TRemovePamProductIdentityMemberDTO,
  TReviewPamAccessRequestDTO,
  TRevokePamAccessRequestDTO,
  TRotatePamAccountDTO,
  TSetPamApprovalConfigDTO,
  TTriggerPamDiscoveryScanDTO,
  TUpdateAccountGroupMemberRoleDTO,
  TUpdateAccountIdentityMemberRoleDTO,
  TUpdateAccountMemberRoleDTO,
  TUpdateFolderGroupMemberRoleDTO,
  TUpdateFolderIdentityMemberRoleDTO,
  TUpdateFolderMemberRoleDTO,
  TUpdatePamAccountDTO,
  TUpdatePamAccountRotationDTO,
  TUpdatePamAccountTemplateDTO,
  TUpdatePamDiscoverySourceDTO,
  TUpdatePamFolderDTO,
  TUpdatePamProductGroupMemberDTO,
  TUpdatePamProductIdentityMemberDTO,
  TUpdatePamProductUserMemberDTO
} from "./types";

// Folders
export const useCreatePamFolder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreatePamFolderDTO) => {
      const { data } = await apiRequest.post<{ folder: TPamFolder }>("/api/v1/pam/folders", params);

      return data.folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      queryClient.invalidateQueries({ queryKey: pamKeys.folder() });
    }
  });
};

export const useUpdatePamFolder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, ...params }: TUpdatePamFolderDTO) => {
      const { data } = await apiRequest.patch<{ folder: TPamFolder }>(
        `/api/v1/pam/folders/${folderId}`,
        params
      );

      return data.folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      queryClient.invalidateQueries({ queryKey: pamKeys.folder() });
    }
  });
};

export const useDeletePamFolder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId }: TDeletePamFolderDTO) => {
      const { data } = await apiRequest.delete<{ folder: TPamFolder }>(
        `/api/v1/pam/folders/${folderId}`
      );

      return data.folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      queryClient.invalidateQueries({ queryKey: pamKeys.folder() });
    }
  });
};

export const useTerminatePamSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string; projectId: string }) => {
      const { data } = await apiRequest.post<{ session: TPamSession }>(
        `/api/v1/pam/sessions/${sessionId}/terminate`
      );

      return data.session;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.session() });
      queryClient.invalidateQueries({ queryKey: pamKeys.getSession(sessionId) });
    }
  });
};

// Account CRUD
export const useCreatePamAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // Validation errors are mapped onto the form fields
    meta: { skipValidationToast: true },
    mutationFn: async ({ accountType, ...params }: TCreatePamAccountDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/accounts/${accountType}`, params);
      return { ...data.account, corsProbeUrl: data.corsProbeUrl as string | null | undefined };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      queryClient.invalidateQueries({ queryKey: pamKeys.folder() });
    }
  });
};

export const useUpdatePamAccount = ({ skipValidationToast = false } = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    meta: skipValidationToast ? { skipValidationToast: true } : undefined,
    mutationFn: async ({ accountId, accountType, ...params }: TUpdatePamAccountDTO) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pam/accounts/${accountType}/${accountId}`,
        params
      );
      return { ...data.account, corsProbeUrl: data.corsProbeUrl as string | null | undefined };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      queryClient.invalidateQueries({ queryKey: pamKeys.folder() });
    }
  });
};

export const useDeletePamAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, accountType }: TDeletePamAccountDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/pam/accounts/${accountType}/${accountId}`);
      return data.account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      queryClient.invalidateQueries({ queryKey: pamKeys.folder() });
    }
  });
};

// Account Template CRUD
export const useCreatePamAccountTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreatePamAccountTemplateDTO) => {
      const { data } = await apiRequest.post<{
        template: TPamAccountTemplate;
        corsProbeUrl?: string | null;
      }>("/api/v1/pam/account-templates", params);
      return { ...data.template, corsProbeUrl: data.corsProbeUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.template() });
      // Template policies/settings feed account accessibility (approval gating, recording config)
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
    }
  });
};

export const useUpdatePamAccountTemplate = ({ skipValidationToast = false } = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    meta: skipValidationToast ? { skipValidationToast: true } : undefined,
    mutationFn: async ({ templateId, ...params }: TUpdatePamAccountTemplateDTO) => {
      const { data } = await apiRequest.patch<{
        template: TPamAccountTemplate;
        corsProbeUrl?: string | null;
      }>(`/api/v1/pam/account-templates/${templateId}`, params);
      return { ...data.template, corsProbeUrl: data.corsProbeUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.template() });
    }
  });
};

export const useDeletePamAccountTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId }: TDeletePamAccountTemplateDTO) => {
      const { data } = await apiRequest.delete<{ template: TPamAccountTemplate }>(
        `/api/v1/pam/account-templates/${templateId}`
      );
      return data.template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.template() });
    }
  });
};

// Account membership mutations
export const useAddAccountMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, userId, role, expiry }: TAddAccountUserMemberDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/accounts/${accountId}/users/${userId}`, {
        role,
        expiry
      });
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useUpdateAccountMemberRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, userId, role }: TUpdateAccountMemberRoleDTO) => {
      const { data } = await apiRequest.patch(`/api/v1/pam/accounts/${accountId}/users/${userId}`, {
        role
      });
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useRemoveAccountMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, userId }: TRemoveAccountMemberDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/pam/accounts/${accountId}/users/${userId}`);
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useAddAccountGroupMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, groupId, role, expiry }: TAddAccountGroupMemberDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pam/accounts/${accountId}/groups/${groupId}`,
        { role, expiry }
      );
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useUpdateAccountGroupMemberRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, groupId, role }: TUpdateAccountGroupMemberRoleDTO) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pam/accounts/${accountId}/groups/${groupId}`,
        { role }
      );
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useRemoveAccountGroupMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, groupId }: TRemoveAccountGroupMemberDTO) => {
      const { data } = await apiRequest.delete(
        `/api/v1/pam/accounts/${accountId}/groups/${groupId}`
      );
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

// Folder membership mutations
export const useAddFolderMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, userId, role, expiry }: TAddFolderUserMemberDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/folders/${folderId}/users/${userId}`, {
        role,
        expiry
      });
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useUpdateFolderMemberRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, userId, role }: TUpdateFolderMemberRoleDTO) => {
      const { data } = await apiRequest.patch(`/api/v1/pam/folders/${folderId}/users/${userId}`, {
        role
      });
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useRemoveFolderMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, userId }: TRemoveFolderMemberDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/pam/folders/${folderId}/users/${userId}`);
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useAddFolderGroupMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, groupId, role, expiry }: TAddFolderGroupMemberDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/folders/${folderId}/groups/${groupId}`, {
        role,
        expiry
      });
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useUpdateFolderGroupMemberRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, groupId, role }: TUpdateFolderGroupMemberRoleDTO) => {
      const { data } = await apiRequest.patch(`/api/v1/pam/folders/${folderId}/groups/${groupId}`, {
        role
      });
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useRemoveFolderGroupMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, groupId }: TRemoveFolderGroupMemberDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/pam/folders/${folderId}/groups/${groupId}`);
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useAccessPamAccount = () => {
  return useMutation({
    mutationFn: async ({
      path,
      reason,
      duration,
      mfaSessionId,
      accessMethod
    }: {
      path: string;
      reason?: string;
      duration?: string;
      mfaSessionId?: string;
      accessMethod?: "cli" | "web";
    }) => {
      const { data } = await apiRequest.post<TPamAccessResponse>("/api/v1/pam/accounts/access", {
        path,
        reason,
        duration,
        mfaSessionId,
        accessMethod
      });
      return data;
    }
  });
};

export const useAddPamProductIdentityMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId, role }: TAddPamProductIdentityMemberDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/memberships/identities/${identityId}`, {
        role
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMemberships(projectId)
      });
    }
  });
};

export const useUpdatePamProductIdentityMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId, role }: TUpdatePamProductIdentityMemberDTO) => {
      const { data } = await apiRequest.patch(`/api/v1/pam/memberships/identities/${identityId}`, {
        role
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMemberships(projectId)
      });
    }
  });
};

export const useRemovePamProductIdentityMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId }: TRemovePamProductIdentityMemberDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/pam/memberships/identities/${identityId}`);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIdentityMemberships(projectId)
      });
    }
  });
};

// Product user/group add & removal must go through the PAM endpoints so the PAM-specific audit
// events fire and approver assignments / folder memberships are handled (the generic workspace
// routes emit project-scoped events and skip that).
export const useAddPamProductUserMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userIds, emails, role }: TAddPamProductUserMemberDTO) => {
      const { data } = await apiRequest.post("/api/v1/pam/memberships/users", {
        userIds,
        emails,
        role
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectUsers(projectId) });
    }
  });
};

export const useAddPamProductGroupMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, role }: TAddPamProductGroupMemberDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/memberships/groups/${groupId}`, {
        role
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.all });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectGroupMemberships(projectId)
      });
    }
  });
};

export const useUpdatePamProductUserMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: TUpdatePamProductUserMemberDTO) => {
      const { data } = await apiRequest.patch(`/api/v1/pam/memberships/users/${userId}`, { role });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectUsers(projectId) });
    }
  });
};

export const useUpdatePamProductGroupMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, role }: TUpdatePamProductGroupMemberDTO) => {
      const { data } = await apiRequest.patch(`/api/v1/pam/memberships/groups/${groupId}`, {
        role
      });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.all });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectGroupMemberships(projectId)
      });
    }
  });
};

export const useRemovePamProductUserMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string; projectId: string }) => {
      const { data } = await apiRequest.delete(`/api/v1/pam/memberships/users/${userId}`);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectUsers(projectId) });
    }
  });
};

export const useRemovePamProductGroupMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId }: { groupId: string; projectId: string }) => {
      const { data } = await apiRequest.delete(`/api/v1/pam/memberships/groups/${groupId}`);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.all });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectGroupMemberships(projectId)
      });
    }
  });
};

export const useAddAccountIdentityMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, identityId, role, expiry }: TAddAccountIdentityMemberDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pam/accounts/${accountId}/identities/${identityId}`,
        { role, expiry }
      );
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useUpdateAccountIdentityMemberRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, identityId, role }: TUpdateAccountIdentityMemberRoleDTO) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pam/accounts/${accountId}/identities/${identityId}`,
        { role }
      );
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useRemoveAccountIdentityMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, identityId }: TRemoveAccountIdentityMemberDTO) => {
      const { data } = await apiRequest.delete(
        `/api/v1/pam/accounts/${accountId}/identities/${identityId}`
      );
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountMembers(accountId) });
    }
  });
};

export const useAddFolderIdentityMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, identityId, role, expiry }: TAddFolderIdentityMemberDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pam/folders/${folderId}/identities/${identityId}`,
        { role, expiry }
      );
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useUpdateFolderIdentityMemberRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, identityId, role }: TUpdateFolderIdentityMemberRoleDTO) => {
      const { data } = await apiRequest.patch(
        `/api/v1/pam/folders/${folderId}/identities/${identityId}`,
        { role }
      );
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

export const useRemoveFolderIdentityMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, identityId }: TRemoveFolderIdentityMemberDTO) => {
      const { data } = await apiRequest.delete(
        `/api/v1/pam/folders/${folderId}/identities/${identityId}`
      );
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.folderMembers(folderId) });
    }
  });
};

// Discovery
export const useCreatePamDiscoverySource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discoveryType, ...body }: TCreatePamDiscoverySourceDTO) => {
      const { data } = await apiRequest.post<{ source: TPamDiscoverySource }>(
        `/api/v1/pam/discovery-sources/${discoveryType}`,
        body
      );
      return data.source;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pamKeys.discovery() })
  });
};

export const useUpdatePamDiscoverySource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discoveryType, sourceId, ...body }: TUpdatePamDiscoverySourceDTO) => {
      const { data } = await apiRequest.patch<{ source: TPamDiscoverySource }>(
        `/api/v1/pam/discovery-sources/${discoveryType}/${sourceId}`,
        body
      );
      return data.source;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pamKeys.discovery() })
  });
};

export const useDeletePamDiscoverySource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discoveryType, sourceId }: TDeletePamDiscoverySourceDTO) => {
      await apiRequest.delete(`/api/v1/pam/discovery-sources/${discoveryType}/${sourceId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pamKeys.discovery() })
  });
};

export const useTriggerPamDiscoveryScan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ discoveryType, sourceId }: TTriggerPamDiscoveryScanDTO) => {
      await apiRequest.post(`/api/v1/pam/discovery-sources/${discoveryType}/${sourceId}/scan`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pamKeys.discovery() })
  });
};

export const useImportPamDiscoveredAccounts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceId, ...body }: TImportPamDiscoveredAccountsDTO) => {
      const { data } = await apiRequest.post<{ results: TImportPamDiscoveredAccountResult[] }>(
        `/api/v1/pam/discovery-sources/${sourceId}/discovered/import`,
        body
      );
      return data.results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.discovery() });
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
      queryClient.invalidateQueries({ queryKey: pamKeys.folder() });
    }
  });
};

export const useUpdatePamAccountRotation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, ...params }: TUpdatePamAccountRotationDTO) => {
      const { data } = await apiRequest.patch(`/api/v1/pam/accounts/${accountId}/rotation`, params);
      return data;
    },
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountRotation(accountId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.getAccount(accountId) });
    }
  });
};

// Access Requests / Approvals

export const useCreatePamAccessRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreatePamAccessRequestDTO) => {
      const { data } = await apiRequest.post("/api/v1/pam/access-requests", params);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accessRequest() });
      // Refresh every account list variant (accessible + admin-list) so the row's access status
      // and its icon flip to pending as soon as the request is submitted.
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
    }
  });
};

export const useRotatePamAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId }: TRotatePamAccountDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/accounts/${accountId}/rotation/rotate`);
      return data;
    },
    onSettled: (_, __, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accountRotation(accountId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.getAccount(accountId) });
    }
  });
};

export const useReviewPamAccessRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, status, comment }: TReviewPamAccessRequestDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/access-requests/${requestId}/review`, {
        status,
        comment
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accessRequest() });
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
    }
  });
};

export const useRevokePamAccessRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId }: TRevokePamAccessRequestDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pam/access-requests/${requestId}/revoke`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pamKeys.accessRequest() });
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
    }
  });
};

export const useSetPamApprovalConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, steps, notificationConfigs }: TSetPamApprovalConfigDTO) => {
      const { data } = await apiRequest.put(
        `/api/v1/pam/folders/${folderId}/approval-configuration`,
        { steps, notificationConfigs }
      );
      return data;
    },
    onSuccess: (_, { folderId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.approvalConfig(folderId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.account() });
    }
  });
};
