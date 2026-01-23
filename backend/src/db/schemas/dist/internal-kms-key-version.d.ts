/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const InternalKmsKeyVersionSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    version: z.ZodNumber;
    internalKmsId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    version: number;
    encryptedKey: Buffer;
    internalKmsId: string;
}, {
    id: string;
    version: number;
    encryptedKey: Buffer;
    internalKmsId: string;
}>;
export type TInternalKmsKeyVersion = z.infer<typeof InternalKmsKeyVersionSchema>;
export type TInternalKmsKeyVersionInsert = Omit<z.input<typeof InternalKmsKeyVersionSchema>, TImmutableDBKeys>;
export type TInternalKmsKeyVersionUpdate = Partial<Omit<z.input<typeof InternalKmsKeyVersionSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=internal-kms-key-version.d.ts.map