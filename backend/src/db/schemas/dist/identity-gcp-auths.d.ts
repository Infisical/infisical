import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityGcpAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
    type: z.ZodString;
    allowedServiceAccounts: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    allowedProjects: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    allowedZones: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
    accessTokenTrustedIps?: unknown;
    allowedServiceAccounts?: string | null | undefined;
    allowedProjects?: string | null | undefined;
    allowedZones?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    identityId: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenPeriod?: number | undefined;
    accessTokenTrustedIps?: unknown;
    allowedServiceAccounts?: string | null | undefined;
    allowedProjects?: string | null | undefined;
    allowedZones?: string | null | undefined;
}>;
export type TIdentityGcpAuths = z.infer<typeof IdentityGcpAuthsSchema>;
export type TIdentityGcpAuthsInsert = Omit<z.input<typeof IdentityGcpAuthsSchema>, TImmutableDBKeys>;
export type TIdentityGcpAuthsUpdate = Partial<Omit<z.input<typeof IdentityGcpAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-gcp-auths.d.ts.map