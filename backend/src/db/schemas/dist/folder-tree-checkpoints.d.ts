import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const FolderTreeCheckpointsSchema: z.ZodObject<{
    id: z.ZodString;
    folderCommitId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderCommitId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderCommitId: string;
}>;
export type TFolderTreeCheckpoints = z.infer<typeof FolderTreeCheckpointsSchema>;
export type TFolderTreeCheckpointsInsert = Omit<z.input<typeof FolderTreeCheckpointsSchema>, TImmutableDBKeys>;
export type TFolderTreeCheckpointsUpdate = Partial<Omit<z.input<typeof FolderTreeCheckpointsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=folder-tree-checkpoints.d.ts.map