import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { CreateTagDTO, DeleteTagDTO, UserWsTags, WsTag } from "./types";

const projectTags = {
  getWsTags: (projectID: string) => ["project-tags", { projectID }] as const
};

const fetchWsTag = async (projectID: string) => {
  const { data } = await apiRequest.get<{ tags: UserWsTags }>(`/api/v1/projects/${projectID}/tags`);

  return data.tags;
};

export const useGetWsTags = (projectID: string) => {
  return useQuery({
    queryKey: projectTags.getWsTags(projectID),
    queryFn: () => fetchWsTag(projectID),
    enabled: Boolean(projectID)
  });
};

export const useCreateWsTag = () => {
  const queryClient = useQueryClient();

  return useMutation<WsTag, object, CreateTagDTO>({
    mutationFn: async ({ projectId: projectID, tagColor, tagSlug }) => {
      const { data } = await apiRequest.post<{ tag: WsTag }>(`/api/v1/projects/${projectID}/tags`, {
        color: tagColor || "",
        slug: tagSlug
      });
      return data.tag;
    },
    onSuccess: (tagData) => {
      queryClient.invalidateQueries({ queryKey: projectTags.getWsTags(tagData?.projectId) });
    }
  });
};

export const useDeleteWsTag = () => {
  const queryClient = useQueryClient();

  return useMutation<WsTag, object, DeleteTagDTO>({
    mutationFn: async ({ tagID, projectId }) => {
      const { data } = await apiRequest.delete<{ tag: WsTag }>(
        `/api/v1/projects/${projectId}/tags/${tagID}`
      );
      return data.tag;
    },
    onSuccess: (tagData) => {
      queryClient.invalidateQueries({ queryKey: projectTags.getWsTags(tagData?.projectId) });
    }
  });
};
