import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityOciAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
    type: z.ZodString;
    tenancyOcid: z.ZodString;
    allowedUsernames: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
    tenancyOcid: string;
    accessTokenTrustedIps?: unknown;
    allowedUsernames?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    identityId: string;
    tenancyOcid: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenPeriod?: number | undefined;
    accessTokenTrustedIps?: unknown;
    allowedUsernames?: string | null | undefined;
}>;
export type TIdentityOciAuths = z.infer<typeof IdentityOciAuthsSchema>;
export type TIdentityOciAuthsInsert = Omit<z.input<typeof IdentityOciAuthsSchema>, TImmutableDBKeys>;
export type TIdentityOciAuthsUpdate = Partial<Omit<z.input<typeof IdentityOciAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-oci-auths.d.ts.map