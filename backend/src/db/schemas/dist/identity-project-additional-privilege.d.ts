import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityProjectAdditionalPrivilegeSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    projectMembershipId: z.ZodString;
    isTemporary: z.ZodDefault<z.ZodBoolean>;
    temporaryMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryRange: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryAccessStartTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    temporaryAccessEndTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    permissions: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isTemporary: boolean;
    projectMembershipId: string;
    slug: string;
    temporaryRange?: string | null | undefined;
    permissions?: unknown;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectMembershipId: string;
    slug: string;
    isTemporary?: boolean | undefined;
    temporaryRange?: string | null | undefined;
    permissions?: unknown;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
}>;
export type TIdentityProjectAdditionalPrivilege = z.infer<typeof IdentityProjectAdditionalPrivilegeSchema>;
export type TIdentityProjectAdditionalPrivilegeInsert = Omit<z.input<typeof IdentityProjectAdditionalPrivilegeSchema>, TImmutableDBKeys>;
export type TIdentityProjectAdditionalPrivilegeUpdate = Partial<Omit<z.input<typeof IdentityProjectAdditionalPrivilegeSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-project-additional-privilege.d.ts.map