import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TBot, TSetBotActiveStatusDto } from "./types";

const queryKeys = {
  getBot: (workspaceId: string) => [{ workspaceId }, "bot"] as const
};

export const useGetWorkspaceBot = (workspaceId: string) =>
  useQuery({
    queryKey: queryKeys.getBot(workspaceId),
    queryFn: async () => {
      const { data: { bot } } = await apiRequest.get<{ bot: TBot }>(`/api/v1/bot/${workspaceId}`);
      return bot;
    },
    enabled: Boolean(workspaceId)
  });

export const useUpdateBotActiveStatus = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TSetBotActiveStatusDto>({
    mutationFn: ({ botId, isActive, botKey }) => {
      return apiRequest.patch(`/api/v1/bot/${botId}/active`, {
        isActive,
        botKey
      });
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(queryKeys.getBot(workspaceId));
    }
  });
};
