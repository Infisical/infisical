import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretImportsSchema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>;
    importPath: z.ZodString;
    importEnv: z.ZodString;
    position: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    folderId: z.ZodString;
    isReplication: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    isReplicationSuccess: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    replicationStatus: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastReplicated: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    isReserved: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderId: string;
    position: number;
    importPath: string;
    importEnv: string;
    version?: number | null | undefined;
    isReserved?: boolean | null | undefined;
    isReplication?: boolean | null | undefined;
    isReplicationSuccess?: boolean | null | undefined;
    replicationStatus?: string | null | undefined;
    lastReplicated?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderId: string;
    position: number;
    importPath: string;
    importEnv: string;
    version?: number | null | undefined;
    isReserved?: boolean | null | undefined;
    isReplication?: boolean | null | undefined;
    isReplicationSuccess?: boolean | null | undefined;
    replicationStatus?: string | null | undefined;
    lastReplicated?: Date | null | undefined;
}>;
export type TSecretImports = z.infer<typeof SecretImportsSchema>;
export type TSecretImportsInsert = Omit<z.input<typeof SecretImportsSchema>, TImmutableDBKeys>;
export type TSecretImportsUpdate = Partial<Omit<z.input<typeof SecretImportsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-imports.d.ts.map