import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamKeys } from "./queries";
import {
  TAddAccountGroupMemberDTO,
  TAddAccountUserMemberDTO,
  TAddFolderGroupMemberDTO,
  TAddFolderUserMemberDTO,
  TCreatePamAccountDTO,
  TCreatePamAccountTemplateDTO,
  TCreatePamFolderDTO,
  TDeletePamAccountDTO,
  TDeletePamAccountTemplateDTO,
  TDeletePamFolderDTO,
  TPamAccountTemplate,
  TPamFolder,
  TPamSession,
  TRemoveAccountGroupMemberDTO,
  TRemoveAccountMemberDTO,
  TRemoveFolderGroupMemberDTO,
  TRemoveFolderMemberDTO,
  TUpdateAccountGroupMemberRoleDTO,
  TUpdateAccountMemberRoleDTO,
  TUpdateFolderGroupMemberRoleDTO,
  TUpdateFolderMemberRoleDTO,
  TUpdatePamAccountDTO,
  TUpdatePamAccountTemplateDTO,
  TUpdatePamFolderDTO
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
