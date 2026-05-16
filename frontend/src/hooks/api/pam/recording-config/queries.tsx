import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPamRecordingConfig } from "./types";

export const pamRecordingConfigKeys = {
  all: ["pam", "recording-config"] as const,
  byProject: (projectId: string) =>
    [...pamRecordingConfigKeys.all, "by-project", projectId] as const
};

export const useGetPamRecordingConfig = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: pamRecordingConfigKeys.byProject(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ config: TPamRecordingConfig | null }>(
        `/api/v1/pam/projects/${projectId}/recording-config`
      );
      return data.config;
    }
  });
