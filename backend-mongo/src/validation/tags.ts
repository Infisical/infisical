import { z } from "zod";

export const GetWorkspaceTagsV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const DeleteWorkspaceTagsV2 = z.object({
  params: z.object({
    tagId: z.string().trim()
  })
});

export const CreateWorkspaceTagsV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    name: z.string().trim(),
    slug: z.string().trim()
  })
});
