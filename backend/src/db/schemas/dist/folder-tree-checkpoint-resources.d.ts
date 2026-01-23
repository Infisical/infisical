import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const FolderTreeCheckpointResourcesSchema: z.ZodObject<{
    id: z.ZodString;
    folderTreeCheckpointId: z.ZodString;
    folderId: z.ZodString;
    folderCommitId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderId: string;
    folderCommitId: string;
    folderTreeCheckpointId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderId: string;
    folderCommitId: string;
    folderTreeCheckpointId: string;
}>;
export type TFolderTreeCheckpointResources = z.infer<typeof FolderTreeCheckpointResourcesSchema>;
export type TFolderTreeCheckpointResourcesInsert = Omit<z.input<typeof FolderTreeCheckpointResourcesSchema>, TImmutableDBKeys>;
export type TFolderTreeCheckpointResourcesUpdate = Partial<Omit<z.input<typeof FolderTreeCheckpointResourcesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=folder-tree-checkpoint-resources.d.ts.map