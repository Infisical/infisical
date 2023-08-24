import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  CreateTagDTO,
  CreateTagRes,
  DeleteTagDTO,
  DeleteWsTagRes,
  UserWsTags,
} from "./types";

const workspaceTags = {
  getWsTags: (workspaceID: string) => ["workspace-tags", { workspaceID }] as const
};

const fetchWsTag = async (workspaceID: string) => {
  const { data } = await apiRequest.get<{ workspaceTags: UserWsTags }>(
    `/api/v2/workspace/${workspaceID}/tags`
  );

  return data.workspaceTags;
};

export const useGetWsTags = (workspaceID: string) => {
  return useQuery({
    queryKey: workspaceTags.getWsTags(workspaceID),
    queryFn: () => fetchWsTag(workspaceID),
    enabled: Boolean(workspaceID)
  });
}


export const useCreateWsTag = () => {
  const queryClient = useQueryClient();

  return useMutation<CreateTagRes, {}, CreateTagDTO>({
    mutationFn: async ({ workspaceID, tagName, tagColor, tagSlug }) => {
      const { data } = await apiRequest.post(`/api/v2/workspace/${workspaceID}/tags`, {
        name: tagName,
        tagColor: tagColor || "",
        slug: tagSlug
      })
      return data;
    },
    onSuccess: (tagData) => {
      queryClient.invalidateQueries(workspaceTags.getWsTags(tagData?.workspace));
    }
  });
};


export const useDeleteWsTag = () => {
  const queryClient = useQueryClient();

  return useMutation<DeleteWsTagRes, {}, DeleteTagDTO>({
    mutationFn: async ({ tagID }) => {
      const { data } = await apiRequest.delete(`/api/v2/workspace/tags/${tagID}`);
      return data
    },
    onSuccess: (tagData) => {
      queryClient.invalidateQueries(workspaceTags.getWsTags(tagData?.workspace));
    }
  });
};