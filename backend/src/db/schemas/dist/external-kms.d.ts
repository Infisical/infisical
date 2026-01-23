/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ExternalKmsSchema: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodString;
    encryptedProviderInputs: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    statusDetails: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    kmsKeyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    provider: string;
    encryptedProviderInputs: Buffer;
    kmsKeyId: string;
    status?: string | null | undefined;
    statusDetails?: string | null | undefined;
}, {
    id: string;
    provider: string;
    encryptedProviderInputs: Buffer;
    kmsKeyId: string;
    status?: string | null | undefined;
    statusDetails?: string | null | undefined;
}>;
export type TExternalKms = z.infer<typeof ExternalKmsSchema>;
export type TExternalKmsInsert = Omit<z.input<typeof ExternalKmsSchema>, TImmutableDBKeys>;
export type TExternalKmsUpdate = Partial<Omit<z.input<typeof ExternalKmsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=external-kms.d.ts.map