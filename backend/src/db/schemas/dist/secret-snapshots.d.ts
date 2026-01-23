import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretSnapshotsSchema: z.ZodObject<{
    id: z.ZodString;
    envId: z.ZodString;
    folderId: z.ZodString;
    parentFolderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    folderId: string;
    parentFolderId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    folderId: string;
    parentFolderId?: string | null | undefined;
}>;
export type TSecretSnapshots = z.infer<typeof SecretSnapshotsSchema>;
export type TSecretSnapshotsInsert = Omit<z.input<typeof SecretSnapshotsSchema>, TImmutableDBKeys>;
export type TSecretSnapshotsUpdate = Partial<Omit<z.input<typeof SecretSnapshotsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-snapshots.d.ts.map