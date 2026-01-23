import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretFolderVersionsSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    version: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    envId: z.ZodString;
    folderId: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    name: string;
    folderId: string;
    description?: string | null | undefined;
    version?: number | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    name: string;
    folderId: string;
    description?: string | null | undefined;
    version?: number | null | undefined;
}>;
export type TSecretFolderVersions = z.infer<typeof SecretFolderVersionsSchema>;
export type TSecretFolderVersionsInsert = Omit<z.input<typeof SecretFolderVersionsSchema>, TImmutableDBKeys>;
export type TSecretFolderVersionsUpdate = Partial<Omit<z.input<typeof SecretFolderVersionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-folder-versions.d.ts.map