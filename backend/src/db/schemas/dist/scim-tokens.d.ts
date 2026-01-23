import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ScimTokensSchema: z.ZodObject<{
    id: z.ZodString;
    ttlDays: z.ZodDefault<z.ZodNumber>;
    description: z.ZodString;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    expiryNotificationSent: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    description: string;
    ttlDays: number;
    expiryNotificationSent?: boolean | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    description: string;
    ttlDays?: number | undefined;
    expiryNotificationSent?: boolean | null | undefined;
}>;
export type TScimTokens = z.infer<typeof ScimTokensSchema>;
export type TScimTokensInsert = Omit<z.input<typeof ScimTokensSchema>, TImmutableDBKeys>;
export type TScimTokensUpdate = Partial<Omit<z.input<typeof ScimTokensSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=scim-tokens.d.ts.map