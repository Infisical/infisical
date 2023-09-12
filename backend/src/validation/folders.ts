import { z } from "zod";

export const CreateFolderV1 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    folderName: z.string().trim(),
    parentFolderId: z.string().trim().optional()
  })
});

export const UpdateFolderV1 = z.object({
  params: z.object({
    folderId: z.string().trim()
  }),
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    name: z.string().trim()
  })
});

export const DeleteFolderV1 = z.object({
  params: z.object({
    folderId: z.string().trim()
  }),
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim()
  })
});

export const GetFoldersV1 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    parentFolderId: z.string().trim().optional(),
    parentFolderPath: z.string().trim().optional()
  })
});
