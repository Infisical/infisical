import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityAzureAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
    tenantId: z.ZodString;
    resource: z.ZodString;
    allowedServicePrincipalIds: z.ZodString;
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
    tenantId: string;
    resource: string;
    allowedServicePrincipalIds: string;
    accessTokenTrustedIps?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    identityId: string;
    tenantId: string;
    resource: string;
    allowedServicePrincipalIds: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenPeriod?: number | undefined;
    accessTokenTrustedIps?: unknown;
}>;
export type TIdentityAzureAuths = z.infer<typeof IdentityAzureAuthsSchema>;
export type TIdentityAzureAuthsInsert = Omit<z.input<typeof IdentityAzureAuthsSchema>, TImmutableDBKeys>;
export type TIdentityAzureAuthsUpdate = Partial<Omit<z.input<typeof IdentityAzureAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-azure-auths.d.ts.map