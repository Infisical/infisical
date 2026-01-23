/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const KmsKeyVersionsSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    version: z.ZodNumber;
    kmsKeyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    version: number;
    kmsKeyId: string;
    encryptedKey: Buffer;
}, {
    id: string;
    version: number;
    kmsKeyId: string;
    encryptedKey: Buffer;
}>;
export type TKmsKeyVersions = z.infer<typeof KmsKeyVersionsSchema>;
export type TKmsKeyVersionsInsert = Omit<z.input<typeof KmsKeyVersionsSchema>, TImmutableDBKeys>;
export type TKmsKeyVersionsUpdate = Partial<Omit<z.input<typeof KmsKeyVersionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=kms-key-versions.d.ts.map