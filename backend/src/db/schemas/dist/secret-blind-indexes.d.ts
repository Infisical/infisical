import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretBlindIndexesSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedSaltCipherText: z.ZodString;
    saltIV: z.ZodString;
    saltTag: z.ZodString;
    algorithm: z.ZodDefault<z.ZodString>;
    keyEncoding: z.ZodDefault<z.ZodString>;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    algorithm: string;
    keyEncoding: string;
    encryptedSaltCipherText: string;
    saltIV: string;
    saltTag: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    encryptedSaltCipherText: string;
    saltIV: string;
    saltTag: string;
    algorithm?: string | undefined;
    keyEncoding?: string | undefined;
}>;
export type TSecretBlindIndexes = z.infer<typeof SecretBlindIndexesSchema>;
export type TSecretBlindIndexesInsert = Omit<z.input<typeof SecretBlindIndexesSchema>, TImmutableDBKeys>;
export type TSecretBlindIndexesUpdate = Partial<Omit<z.input<typeof SecretBlindIndexesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-blind-indexes.d.ts.map