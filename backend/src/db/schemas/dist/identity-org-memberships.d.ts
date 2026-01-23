import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const IdentityOrgMembershipsSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodString;
    roleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    identityId: z.ZodString;
    lastLoginAuthMethod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastLoginTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    role: string;
    identityId: string;
    roleId?: string | null | undefined;
    lastLoginAuthMethod?: string | null | undefined;
    lastLoginTime?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    role: string;
    identityId: string;
    roleId?: string | null | undefined;
    lastLoginAuthMethod?: string | null | undefined;
    lastLoginTime?: Date | null | undefined;
}>;
export type TIdentityOrgMemberships = z.infer<typeof IdentityOrgMembershipsSchema>;
export type TIdentityOrgMembershipsInsert = Omit<z.input<typeof IdentityOrgMembershipsSchema>, TImmutableDBKeys>;
export type TIdentityOrgMembershipsUpdate = Partial<Omit<z.input<typeof IdentityOrgMembershipsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=identity-org-memberships.d.ts.map