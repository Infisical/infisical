import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const RateLimitSchema: z.ZodObject<{
    id: z.ZodString;
    readRateLimit: z.ZodDefault<z.ZodNumber>;
    writeRateLimit: z.ZodDefault<z.ZodNumber>;
    secretsRateLimit: z.ZodDefault<z.ZodNumber>;
    authRateLimit: z.ZodDefault<z.ZodNumber>;
    inviteUserRateLimit: z.ZodDefault<z.ZodNumber>;
    mfaRateLimit: z.ZodDefault<z.ZodNumber>;
    publicEndpointLimit: z.ZodDefault<z.ZodNumber>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    readRateLimit: number;
    writeRateLimit: number;
    secretsRateLimit: number;
    authRateLimit: number;
    inviteUserRateLimit: number;
    mfaRateLimit: number;
    publicEndpointLimit: number;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    readRateLimit?: number | undefined;
    writeRateLimit?: number | undefined;
    secretsRateLimit?: number | undefined;
    authRateLimit?: number | undefined;
    inviteUserRateLimit?: number | undefined;
    mfaRateLimit?: number | undefined;
    publicEndpointLimit?: number | undefined;
}>;
export type TRateLimit = z.infer<typeof RateLimitSchema>;
export type TRateLimitInsert = Omit<z.input<typeof RateLimitSchema>, TImmutableDBKeys>;
export type TRateLimitUpdate = Partial<Omit<z.input<typeof RateLimitSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=rate-limit.d.ts.map