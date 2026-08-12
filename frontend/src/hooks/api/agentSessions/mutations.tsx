import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { agentSessionQueryKeys } from "./queries";
import { TAgentSession, TRevokeAgentSessionDTO } from "./types";

export const useRevokeAgentSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId }: TRevokeAgentSessionDTO) => {
      const { data } = await apiRequest.post<{ agentSession: TAgentSession }>(
        `/api/v1/agent-sessions/${sessionId}/revoke`
      );
      return data.agentSession;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: agentSessionQueryKeys.list(projectId) });
    }
  });
};
