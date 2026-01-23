import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityTokenAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
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
    accessTokenTrustedIps?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    identityId: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenPeriod?: number | undefined;
    accessTokenTrustedIps?: unknown;
}>;
export type TIdentityTokenAuths = z.infer<typeof IdentityTokenAuthsSchema>;
export type TIdentityTokenAuthsInsert = Omit<z.input<typeof IdentityTokenAuthsSchema>, TImmutableDBKeys>;
export type TIdentityTokenAuthsUpdate = Partial<Omit<z.input<typeof IdentityTokenAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-token-auths.d.ts.map