import type { CreateTagDTO, DeleteTagDTO, UpdateTagDTO, WsTag } from "@app/hooks/api/tags/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ProjectTagsAdapter = {
  useTags: (projectId: string) => V4QueryResult<WsTag[]>;
  useCreateTag: V4Mutation<CreateTagDTO, WsTag>;
  useUpdateTag: V4Mutation<UpdateTagDTO, WsTag>;
  useDeleteTag: V4Mutation<DeleteTagDTO, WsTag>;
};
