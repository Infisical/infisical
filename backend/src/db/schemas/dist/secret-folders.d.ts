import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretFoldersSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    version: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    envId: z.ZodString;
    parentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isReserved: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastSecretModified: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    name: string;
    description?: string | null | undefined;
    version?: number | null | undefined;
    isReserved?: boolean | null | undefined;
    parentId?: string | null | undefined;
    lastSecretModified?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    envId: string;
    name: string;
    description?: string | null | undefined;
    version?: number | null | undefined;
    isReserved?: boolean | null | undefined;
    parentId?: string | null | undefined;
    lastSecretModified?: Date | null | undefined;
}>;
export type TSecretFolders = z.infer<typeof SecretFoldersSchema>;
export type TSecretFoldersInsert = Omit<z.input<typeof SecretFoldersSchema>, TImmutableDBKeys>;
export type TSecretFoldersUpdate = Partial<Omit<z.input<typeof SecretFoldersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-folders.d.ts.map