import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { nhiKeys } from "./queries";
import { NhiRemediationActionType, TNhiIdentity, TNhiRemediationAction, TNhiScan, TNhiSource } from "./types";

export const useCreateNhiSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      name: string;
      provider: string;
      connectionId: string;
      config?: Record<string, unknown>;
    }) => {
      const { data } = await apiRequest.post<{ source: TNhiSource }>("/api/v1/nhi/sources", params);
      return data.source;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: nhiKeys.sources(projectId) });
    }
  });
};

export const useDeleteNhiSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceId, projectId }: { sourceId: string; projectId: string }) => {
      const { data } = await apiRequest.delete<{ source: TNhiSource }>(
        `/api/v1/nhi/sources/${sourceId}`,
        { params: { projectId } }
      );
      return data.source;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: nhiKeys.sources(projectId) });
      queryClient.invalidateQueries({ queryKey: nhiKeys.stats(projectId) });
    }
  });
};

export const useTriggerNhiScan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceId, projectId }: { sourceId: string; projectId: string }) => {
      const { data } = await apiRequest.post<{ scan: TNhiScan }>(
        `/api/v1/nhi/sources/${sourceId}/scan`,
        { projectId }
      );
      return data.scan;
    },
    onSuccess: (_, { sourceId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: nhiKeys.sources(projectId) });
      queryClient.invalidateQueries({ queryKey: nhiKeys.scans(sourceId) });
    }
  });
};

export const useUpdateNhiIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      identityId,
      projectId,
      ownerEmail,
      status
    }: {
      identityId: string;
      projectId: string;
      ownerEmail?: string | null;
      status?: string;
    }) => {
      const { data } = await apiRequest.patch<{ identity: TNhiIdentity }>(
        `/api/v1/nhi/identities/${identityId}`,
        { projectId, ownerEmail, status }
      );
      return data.identity;
    },
    onSuccess: (result, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: nhiKeys.identityById(result.id) });
      queryClient.invalidateQueries({
        queryKey: nhiKeys.identities(projectId)
      });
      queryClient.invalidateQueries({ queryKey: nhiKeys.stats(projectId) });
    }
  });
};

export const useExecuteRemediation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      identityId,
      projectId,
      actionType,
      riskFactor
    }: {
      identityId: string;
      projectId: string;
      actionType: NhiRemediationActionType;
      riskFactor?: string;
    }) => {
      const { data } = await apiRequest.post<{ action: TNhiRemediationAction }>(
        `/api/v1/nhi/identities/${identityId}/remediate`,
        { projectId, actionType, riskFactor }
      );
      return data.action;
    },
    onSuccess: (_, { identityId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: nhiKeys.remediationActions(identityId) });
      queryClient.invalidateQueries({ queryKey: nhiKeys.recommendedActions(identityId) });
      queryClient.invalidateQueries({ queryKey: nhiKeys.identityById(identityId) });
      queryClient.invalidateQueries({ queryKey: nhiKeys.identities(projectId) });
      queryClient.invalidateQueries({ queryKey: nhiKeys.stats(projectId) });
    }
  });
};
