import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AuthTokensSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    phoneNumber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tokenHash: z.ZodString;
    triesLeft: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    expiresAt: z.ZodDate;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    aliasId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    payload: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    expiresAt: Date;
    tokenHash: string;
    orgId?: string | null | undefined;
    userId?: string | null | undefined;
    phoneNumber?: string | null | undefined;
    triesLeft?: number | null | undefined;
    aliasId?: string | null | undefined;
    payload?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    expiresAt: Date;
    tokenHash: string;
    orgId?: string | null | undefined;
    userId?: string | null | undefined;
    phoneNumber?: string | null | undefined;
    triesLeft?: number | null | undefined;
    aliasId?: string | null | undefined;
    payload?: string | null | undefined;
}>;
export type TAuthTokens = z.infer<typeof AuthTokensSchema>;
export type TAuthTokensInsert = Omit<z.input<typeof AuthTokensSchema>, TImmutableDBKeys>;
export type TAuthTokensUpdate = Partial<Omit<z.input<typeof AuthTokensSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=auth-tokens.d.ts.map