import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TBot, TSetBotActiveStatusDto } from "./types";

const queryKeys = {
  getBot: (workspaceId: string) => [{ workspaceId }, "bot"] as const
};

const fetchWorkspaceBot = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ bot: TBot }>(`/api/v1/bot/${workspaceId}`);
  return data.bot;
};

export const useGetWorkspaceBot = (workspaceId: string) =>
  useQuery({
    queryKey: queryKeys.getBot(workspaceId),
    queryFn: () => fetchWorkspaceBot(workspaceId),
    enabled: Boolean(workspaceId)
  });

// mutation

export const useUpdateBotActiveStatus = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TSetBotActiveStatusDto>({
    mutationFn: ({ botId, isActive, botKey }) =>
      apiRequest.patch(`/api/v1/bot/${botId}/active`, {
        isActive,
        botKey
      }),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(queryKeys.getBot(workspaceId));
    }
  });
};
