import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AuthTokenSessionsSchema: z.ZodObject<{
    id: z.ZodString;
    ip: z.ZodString;
    userAgent: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    refreshVersion: z.ZodDefault<z.ZodNumber>;
    accessVersion: z.ZodDefault<z.ZodNumber>;
    lastUsed: z.ZodDate;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    ip: string;
    userId: string;
    lastUsed: Date;
    refreshVersion: number;
    accessVersion: number;
    userAgent?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    ip: string;
    userId: string;
    lastUsed: Date;
    userAgent?: string | null | undefined;
    refreshVersion?: number | undefined;
    accessVersion?: number | undefined;
}>;
export type TAuthTokenSessions = z.infer<typeof AuthTokenSessionsSchema>;
export type TAuthTokenSessionsInsert = Omit<z.input<typeof AuthTokenSessionsSchema>, TImmutableDBKeys>;
export type TAuthTokenSessionsUpdate = Partial<Omit<z.input<typeof AuthTokenSessionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=auth-token-sessions.d.ts.map