/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const InternalKmsSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptionAlgorithm: z.ZodString;
    version: z.ZodDefault<z.ZodNumber>;
    kmsKeyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    version: number;
    kmsKeyId: string;
    encryptedKey: Buffer;
    encryptionAlgorithm: string;
}, {
    id: string;
    kmsKeyId: string;
    encryptedKey: Buffer;
    encryptionAlgorithm: string;
    version?: number | undefined;
}>;
export type TInternalKms = z.infer<typeof InternalKmsSchema>;
export type TInternalKmsInsert = Omit<z.input<typeof InternalKmsSchema>, TImmutableDBKeys>;
export type TInternalKmsUpdate = Partial<Omit<z.input<typeof InternalKmsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=internal-kms.d.ts.map