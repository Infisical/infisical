import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const FolderCommitsSchema: z.ZodObject<{
    id: z.ZodString;
    commitId: z.ZodBigInt;
    actorMetadata: z.ZodUnknown;
    actorType: z.ZodString;
    message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    folderId: z.ZodString;
    envId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    commitId: bigint;
    envId: string;
    folderId: string;
    actorType: string;
    message?: string | null | undefined;
    actorMetadata?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    commitId: bigint;
    envId: string;
    folderId: string;
    actorType: string;
    message?: string | null | undefined;
    actorMetadata?: unknown;
}>;
export type TFolderCommits = z.infer<typeof FolderCommitsSchema>;
export type TFolderCommitsInsert = Omit<z.input<typeof FolderCommitsSchema>, TImmutableDBKeys>;
export type TFolderCommitsUpdate = Partial<Omit<z.input<typeof FolderCommitsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=folder-commits.d.ts.map