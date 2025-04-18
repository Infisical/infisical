import { useMutation } from "@tanstack/react-query";
import { TProjectAssumePrivilegesDTO } from "./types";
import { apiRequest } from "@app/config/request";

export const useAssumeProjectPrivileges = () =>
  useMutation({
    mutationFn: async ({ projectId, actorId, actorType }: TProjectAssumePrivilegesDTO) => {
      const { data } = await apiRequest.post<{ message: string }>(
        `/api/v1/workspace/${projectId}/assume-privileges`,
        { actorId, actorType }
      );

      return data;
    }
  });

export const useRemoveAssumeProjectPrivilege = () =>
  useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const { data } = await apiRequest.delete<{ message: string }>(
        `/api/v1/workspace/${projectId}/assume-privileges`
      );

      return data;
    }
  });
