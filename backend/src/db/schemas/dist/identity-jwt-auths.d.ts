/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityJwtAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    identityId: z.ZodString;
    configurationType: z.ZodString;
    jwksUrl: z.ZodString;
    encryptedJwksCaCert: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedPublicKeys: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    boundIssuer: z.ZodString;
    boundAudiences: z.ZodString;
    boundClaims: z.ZodUnknown;
    boundSubject: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    accessTokenPeriod: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    identityId: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenPeriod: number;
    configurationType: string;
    jwksUrl: string;
    encryptedJwksCaCert: Buffer;
    encryptedPublicKeys: Buffer;
    boundIssuer: string;
    boundAudiences: string;
    boundSubject: string;
    accessTokenTrustedIps?: unknown;
    boundClaims?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    identityId: string;
    configurationType: string;
    jwksUrl: string;
    encryptedJwksCaCert: Buffer;
    encryptedPublicKeys: Buffer;
    boundIssuer: string;
    boundAudiences: string;
    boundSubject: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenPeriod?: number | undefined;
    accessTokenTrustedIps?: unknown;
    boundClaims?: unknown;
}>;
export type TIdentityJwtAuths = z.infer<typeof IdentityJwtAuthsSchema>;
export type TIdentityJwtAuthsInsert = Omit<z.input<typeof IdentityJwtAuthsSchema>, TImmutableDBKeys>;
export type TIdentityJwtAuthsUpdate = Partial<Omit<z.input<typeof IdentityJwtAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-jwt-auths.d.ts.map