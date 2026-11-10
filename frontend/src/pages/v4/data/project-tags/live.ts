import {
  useCreateWsTag,
  useDeleteWsTag,
  useGetWsTags,
  useUpdateWsTag
} from "@app/hooks/api/tags/queries";

import type { ProjectTagsAdapter } from "./contract";

export const projectTagsLive: ProjectTagsAdapter = {
  useTags: useGetWsTags,
  useCreateTag: useCreateWsTag,
  useUpdateTag: useUpdateWsTag,
  useDeleteTag: useDeleteWsTag
};
