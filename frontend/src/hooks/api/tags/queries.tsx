import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { CreateTagDTO, DeleteTagDTO, UserWsTags, WsTag } from "./types";

const workspaceTags = {
  getWsTags: (workspaceID: string) => ["workspace-tags", { workspaceID }] as const
};

const fetchWsTag = async (workspaceID: string) => {
  const { data } = await apiRequest.get<{ workspaceTags: UserWsTags }>(
    `/api/v1/workspace/${workspaceID}/tags`
  );

  return data.workspaceTags;
};

export const useGetWsTags = (workspaceID: string) => {
  return useQuery({
    queryKey: workspaceTags.getWsTags(workspaceID),
    queryFn: () => fetchWsTag(workspaceID),
    enabled: Boolean(workspaceID)
  });
};

export const useCreateWsTag = () => {
  const queryClient = useQueryClient();

  return useMutation<WsTag, {}, CreateTagDTO>({
    mutationFn: async ({ workspaceID, tagColor, tagSlug }) => {
      const { data } = await apiRequest.post<{ workspaceTag: WsTag }>(
        `/api/v1/workspace/${workspaceID}/tags`,
        {
          color: tagColor || "",
          slug: tagSlug
        }
      );
      return data.workspaceTag;
    },
    onSuccess: (tagData) => {
      queryClient.invalidateQueries(workspaceTags.getWsTags(tagData?.projectId));
    }
  });
};

export const useDeleteWsTag = () => {
  const queryClient = useQueryClient();

  return useMutation<WsTag, {}, DeleteTagDTO>({
    mutationFn: async ({ tagID, projectId }) => {
      const { data } = await apiRequest.delete<{ workspaceTag: WsTag }>(
        `/api/v1/workspace/${projectId}/tags/${tagID}`
      );
      return data.workspaceTag;
    },
    onSuccess: (tagData) => {
      queryClient.invalidateQueries(workspaceTags.getWsTags(tagData?.projectId));
    }
  });
};
