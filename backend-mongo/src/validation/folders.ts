import { z } from "zod";

export const CreateFolderV1 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    folderName: z.string().trim(),
    directory: z.string().trim().default("/")
  })
});

export const UpdateFolderV1 = z.object({
  params: z.object({
    folderName: z.string().trim()
  }),
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    name: z.string().trim(),
    directory: z.string().trim().default("/")
  })
});

export const DeleteFolderV1 = z.object({
  params: z.object({
    folderName: z.string().trim()
  }),
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    directory: z.string().trim().default("/")
  })
});

export const GetFoldersV1 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    directory: z.string().trim().default("/")
  })
});
