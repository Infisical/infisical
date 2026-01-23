import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const UserAliasesSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    aliasType: z.ZodString;
    externalId: z.ZodString;
    emails: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    orgId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    isEmailVerified: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    externalId: string;
    aliasType: string;
    orgId?: string | null | undefined;
    emails?: string[] | null | undefined;
    username?: string | null | undefined;
    isEmailVerified?: boolean | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    externalId: string;
    aliasType: string;
    orgId?: string | null | undefined;
    emails?: string[] | null | undefined;
    username?: string | null | undefined;
    isEmailVerified?: boolean | null | undefined;
}>;
export type TUserAliases = z.infer<typeof UserAliasesSchema>;
export type TUserAliasesInsert = Omit<z.input<typeof UserAliasesSchema>, TImmutableDBKeys>;
export type TUserAliasesUpdate = Partial<Omit<z.input<typeof UserAliasesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=user-aliases.d.ts.map