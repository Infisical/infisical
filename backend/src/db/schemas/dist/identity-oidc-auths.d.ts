/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityOidcAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    identityId: z.ZodString;
    oidcDiscoveryUrl: z.ZodString;
    encryptedCaCert: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    caCertIV: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    caCertTag: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    boundIssuer: z.ZodString;
    boundAudiences: z.ZodString;
    boundClaims: z.ZodUnknown;
    boundSubject: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    encryptedCaCertificate: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    claimMetadataMapping: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
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
    boundIssuer: string;
    boundAudiences: string;
    oidcDiscoveryUrl: string;
    accessTokenTrustedIps?: unknown;
    boundClaims?: unknown;
    boundSubject?: string | null | undefined;
    encryptedCaCert?: string | null | undefined;
    caCertIV?: string | null | undefined;
    caCertTag?: string | null | undefined;
    encryptedCaCertificate?: Buffer | null | undefined;
    claimMetadataMapping?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    identityId: string;
    boundIssuer: string;
    boundAudiences: string;
    oidcDiscoveryUrl: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenPeriod?: number | undefined;
    accessTokenTrustedIps?: unknown;
    boundClaims?: unknown;
    boundSubject?: string | null | undefined;
    encryptedCaCert?: string | null | undefined;
    caCertIV?: string | null | undefined;
    caCertTag?: string | null | undefined;
    encryptedCaCertificate?: Buffer | null | undefined;
    claimMetadataMapping?: unknown;
}>;
export type TIdentityOidcAuths = z.infer<typeof IdentityOidcAuthsSchema>;
export type TIdentityOidcAuthsInsert = Omit<z.input<typeof IdentityOidcAuthsSchema>, TImmutableDBKeys>;
export type TIdentityOidcAuthsUpdate = Partial<Omit<z.input<typeof IdentityOidcAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-oidc-auths.d.ts.map