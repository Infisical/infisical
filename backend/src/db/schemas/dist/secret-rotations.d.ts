/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretRotationsSchema: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodString;
    secretPath: z.ZodString;
    interval: z.ZodNumber;
    lastRotatedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    statusMessage: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedData: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedDataIV: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedDataTag: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    algorithm: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    keyEncoding: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    envId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    encryptedRotationData: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    secretPath: string;
    envId: string;
    provider: string;
    interval: number;
    encryptedRotationData: Buffer;
    status?: string | null | undefined;
    algorithm?: string | null | undefined;
    keyEncoding?: string | null | undefined;
    lastRotatedAt?: Date | null | undefined;
    statusMessage?: string | null | undefined;
    encryptedData?: string | null | undefined;
    encryptedDataIV?: string | null | undefined;
    encryptedDataTag?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    secretPath: string;
    envId: string;
    provider: string;
    interval: number;
    encryptedRotationData: Buffer;
    status?: string | null | undefined;
    algorithm?: string | null | undefined;
    keyEncoding?: string | null | undefined;
    lastRotatedAt?: Date | null | undefined;
    statusMessage?: string | null | undefined;
    encryptedData?: string | null | undefined;
    encryptedDataIV?: string | null | undefined;
    encryptedDataTag?: string | null | undefined;
}>;
export type TSecretRotations = z.infer<typeof SecretRotationsSchema>;
export type TSecretRotationsInsert = Omit<z.input<typeof SecretRotationsSchema>, TImmutableDBKeys>;
export type TSecretRotationsUpdate = Partial<Omit<z.input<typeof SecretRotationsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-rotations.d.ts.map