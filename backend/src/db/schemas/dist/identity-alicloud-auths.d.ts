import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityAlicloudAuthsSchema: z.ZodObject<{
    id: z.ZodString;
    accessTokenTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenMaxTTL: z.ZodDefault<z.ZodNumber>;
    accessTokenNumUsesLimit: z.ZodDefault<z.ZodNumber>;
    accessTokenTrustedIps: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
    type: z.ZodString;
    allowedArns: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    identityId: string;
    accessTokenTTL: number;
    accessTokenMaxTTL: number;
    accessTokenNumUsesLimit: number;
    allowedArns: string;
    accessTokenTrustedIps?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    identityId: string;
    allowedArns: string;
    accessTokenTTL?: number | undefined;
    accessTokenMaxTTL?: number | undefined;
    accessTokenNumUsesLimit?: number | undefined;
    accessTokenTrustedIps?: unknown;
}>;
export type TIdentityAlicloudAuths = z.infer<typeof IdentityAlicloudAuthsSchema>;
export type TIdentityAlicloudAuthsInsert = Omit<z.input<typeof IdentityAlicloudAuthsSchema>, TImmutableDBKeys>;
export type TIdentityAlicloudAuthsUpdate = Partial<Omit<z.input<typeof IdentityAlicloudAuthsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-alicloud-auths.d.ts.map