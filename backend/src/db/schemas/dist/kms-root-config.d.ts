/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const KmsRootConfigSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedRootKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptionStrategy: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodString>>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedRootKey: Buffer;
    encryptionStrategy?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedRootKey: Buffer;
    encryptionStrategy?: string | null | undefined;
}>;
export type TKmsRootConfig = z.infer<typeof KmsRootConfigSchema>;
export type TKmsRootConfigInsert = Omit<z.input<typeof KmsRootConfigSchema>, TImmutableDBKeys>;
export type TKmsRootConfigUpdate = Partial<Omit<z.input<typeof KmsRootConfigSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=kms-root-config.d.ts.map