import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { infraKeys } from "./queries";
import { TInfraFile, TInfraRun, TInfraVariable, TRunResult } from "./types";

export const useUpsertInfraFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      name,
      content
    }: {
      projectId: string;
      name: string;
      content: string;
    }) => {
      const { data } = await apiRequest.post<{ file: TInfraFile }>(
        `/api/v1/infra/${projectId}/files`,
        {
          name,
          content
        }
      );
      return data.file;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.files(projectId) });
    }
  });
};

export const useDeleteInfraFile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, name }: { projectId: string; name: string }) => {
      await apiRequest.delete(`/api/v1/infra/${projectId}/files/${encodeURIComponent(name)}`);
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.files(projectId) });
    }
  });
};

export const useTriggerInfraRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, mode, approved }: { projectId: string; mode: "plan" | "apply" | "destroy"; approved?: boolean }) => {
      const { data } = await apiRequest.post<TRunResult>(`/api/v1/infra/${projectId}/run`, { mode, approved });
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.runs(projectId) });
    }
  });
};

export const useApproveInfraRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, runId }: { projectId: string; runId: string }) => {
      const { data } = await apiRequest.post<{ run: TInfraRun }>(
        `/api/v1/infra/${projectId}/runs/${runId}/approve`
      );
      return data.run;
    },
    onSuccess: (_, { projectId, runId }) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.runs(projectId) });
      queryClient.invalidateQueries({ queryKey: infraKeys.run(runId) });
    }
  });
};

export const useDenyInfraRun = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, runId }: { projectId: string; runId: string }) => {
      const { data } = await apiRequest.post<{ run: TInfraRun }>(
        `/api/v1/infra/${projectId}/runs/${runId}/deny`
      );
      return data.run;
    },
    onSuccess: (_, { projectId, runId }) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.runs(projectId) });
      queryClient.invalidateQueries({ queryKey: infraKeys.run(runId) });
    }
  });
};

export const useUpsertInfraVariable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      key,
      value,
      sensitive
    }: {
      projectId: string;
      key: string;
      value: string;
      sensitive?: boolean;
    }) => {
      const { data } = await apiRequest.post<{ variable: TInfraVariable }>(
        `/api/v1/infra/${projectId}/variables`,
        { key, value, sensitive }
      );
      return data.variable;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.variables(projectId) });
    }
  });
};

export const useDeleteInfraVariable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, key }: { projectId: string; key: string }) => {
      await apiRequest.delete(`/api/v1/infra/${projectId}/variables/${encodeURIComponent(key)}`);
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.variables(projectId) });
    }
  });
};
