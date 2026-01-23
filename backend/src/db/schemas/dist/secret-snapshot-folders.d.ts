import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretSnapshotFoldersSchema: z.ZodObject<{
    id: z.ZodString;
    envId: z.ZodString;
    folderVersionId: z.ZodString;
    snapshotId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    folderVersionId: string;
    snapshotId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    folderVersionId: string;
    snapshotId: string;
}>;
export type TSecretSnapshotFolders = z.infer<typeof SecretSnapshotFoldersSchema>;
export type TSecretSnapshotFoldersInsert = Omit<z.input<typeof SecretSnapshotFoldersSchema>, TImmutableDBKeys>;
export type TSecretSnapshotFoldersUpdate = Partial<Omit<z.input<typeof SecretSnapshotFoldersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-snapshot-folders.d.ts.map