import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityAwsAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
    type: z.ZodString;
    stsEndpoint: z.ZodString;
    allowedPrincipalArns: z.ZodString;
    allowedAccountIds: z.ZodString;
    accessTokenPeriod: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    identityId: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    accessTokenPeriod: number;
    stsEndpoint: string;
    allowedPrincipalArns: string;
    allowedAccountIds: string;
    accessTokenTrustedIps?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    identityId: string;
    stsEndpoint: string;
    allowedPrincipalArns: string;
    allowedAccountIds: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenPeriod?: number | undefined;
    accessTokenTrustedIps?: unknown;
}>;
export type TIdentityAwsAuths = z.infer<typeof IdentityAwsAuthsSchema>;
export type TIdentityAwsAuthsInsert = Omit<z.input<typeof IdentityAwsAuthsSchema>, TImmutableDBKeys>;
export type TIdentityAwsAuthsUpdate = Partial<Omit<z.input<typeof IdentityAwsAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-aws-auths.d.ts.map