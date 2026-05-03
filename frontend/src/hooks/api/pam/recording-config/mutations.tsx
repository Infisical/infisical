import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pamRecordingConfigKeys } from "./queries";
import { TPamRecordingConfig, TUpsertPamRecordingConfigDTO } from "./types";

export const useUpsertPamRecordingConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: TUpsertPamRecordingConfigDTO) => {
      const { data } = await apiRequest.post<{
        config: TPamRecordingConfig;
        corsProbeUrl: string | null;
      }>(`/api/v1/pam/projects/${projectId}/recording-config`, body);
      return data;
    },
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: pamRecordingConfigKeys.byProject(vars.projectId)
      });
    }
  });
};

export const useDeletePamRecordingConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const { data } = await apiRequest.delete<{ ok: true }>(
        `/api/v1/pam/projects/${projectId}/recording-config`
      );
      return data;
    },
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: pamRecordingConfigKeys.byProject(vars.projectId)
      });
    }
  });
};
