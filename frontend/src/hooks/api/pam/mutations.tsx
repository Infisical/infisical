import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamKeys } from "./queries";
import {
  TCreatePamFolderDTO,
  TDeletePamFolderDTO,
  TPamFolder,
  TPamSession,
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
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
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
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
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
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listAccounts({ projectId }) });
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
    onSuccess: (_, { projectId, sessionId }) => {
      queryClient.invalidateQueries({ queryKey: pamKeys.listSessions(projectId) });
      queryClient.invalidateQueries({ queryKey: pamKeys.getSession(sessionId) });
    }
  });
};
