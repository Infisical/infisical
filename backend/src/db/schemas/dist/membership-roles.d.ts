import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const MembershipRolesSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodString;
    isTemporary: z.ZodDefault<z.ZodBoolean>;
    temporaryMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryRange: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryAccessStartTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    temporaryAccessEndTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    customRoleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    membershipId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isTemporary: boolean;
    role: string;
    membershipId: string;
    temporaryRange?: string | null | undefined;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
    customRoleId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    role: string;
    membershipId: string;
    isTemporary?: boolean | undefined;
    temporaryRange?: string | null | undefined;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
    customRoleId?: string | null | undefined;
}>;
export type TMembershipRoles = z.infer<typeof MembershipRolesSchema>;
export type TMembershipRolesInsert = Omit<z.input<typeof MembershipRolesSchema>, TImmutableDBKeys>;
export type TMembershipRolesUpdate = Partial<Omit<z.input<typeof MembershipRolesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=membership-roles.d.ts.map