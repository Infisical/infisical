import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const FolderCheckpointResourcesSchema: z.ZodObject<{
    id: z.ZodString;
    folderCheckpointId: z.ZodString;
    secretVersionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    folderVersionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderCheckpointId: string;
    secretVersionId?: string | null | undefined;
    folderVersionId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderCheckpointId: string;
    secretVersionId?: string | null | undefined;
    folderVersionId?: string | null | undefined;
}>;
export type TFolderCheckpointResources = z.infer<typeof FolderCheckpointResourcesSchema>;
export type TFolderCheckpointResourcesInsert = Omit<z.input<typeof FolderCheckpointResourcesSchema>, TImmutableDBKeys>;
export type TFolderCheckpointResourcesUpdate = Partial<Omit<z.input<typeof FolderCheckpointResourcesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=folder-checkpoint-resources.d.ts.map