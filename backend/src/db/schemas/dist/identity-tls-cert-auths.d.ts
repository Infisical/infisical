/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityTlsCertAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
    allowedCommonNames: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedCaCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    identityId: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    encryptedCaCertificate: Buffer;
    accessTokenTrustedIps?: unknown;
    allowedCommonNames?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    identityId: string;
    encryptedCaCertificate: Buffer;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenTrustedIps?: unknown;
    allowedCommonNames?: string | null | undefined;
}>;
export type TIdentityTlsCertAuths = z.infer<typeof IdentityTlsCertAuthsSchema>;
export type TIdentityTlsCertAuthsInsert = Omit<z.input<typeof IdentityTlsCertAuthsSchema>, TImmutableDBKeys>;
export type TIdentityTlsCertAuthsUpdate = Partial<Omit<z.input<typeof IdentityTlsCertAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-tls-cert-auths.d.ts.map