import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const FolderCheckpointsSchema: z.ZodObject<{
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
export type TFolderCheckpoints = z.infer<typeof FolderCheckpointsSchema>;
export type TFolderCheckpointsInsert = Omit<z.input<typeof FolderCheckpointsSchema>, TImmutableDBKeys>;
export type TFolderCheckpointsUpdate = Partial<Omit<z.input<typeof FolderCheckpointsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=folder-checkpoints.d.ts.map