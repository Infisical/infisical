import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const FolderCommitChangesSchema: z.ZodObject<{
    id: z.ZodString;
    folderCommitId: z.ZodString;
    changeType: z.ZodString;
    isUpdate: z.ZodDefault<z.ZodBoolean>;
    secretVersionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    folderVersionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderCommitId: string;
    changeType: string;
    isUpdate: boolean;
    secretVersionId?: string | null | undefined;
    folderVersionId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderCommitId: string;
    changeType: string;
    secretVersionId?: string | null | undefined;
    folderVersionId?: string | null | undefined;
    isUpdate?: boolean | undefined;
}>;
export type TFolderCommitChanges = z.infer<typeof FolderCommitChangesSchema>;
export type TFolderCommitChangesInsert = Omit<z.input<typeof FolderCommitChangesSchema>, TImmutableDBKeys>;
export type TFolderCommitChangesUpdate = Partial<Omit<z.input<typeof FolderCommitChangesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=folder-commit-changes.d.ts.map