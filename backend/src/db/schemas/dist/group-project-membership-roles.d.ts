import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const GroupProjectMembershipRolesSchema: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodString;
    projectMembershipId: z.ZodString;
    customRoleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isTemporary: z.ZodDefault<z.ZodBoolean>;
    temporaryMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryRange: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryAccessStartTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    temporaryAccessEndTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isTemporary: boolean;
    role: string;
    projectMembershipId: string;
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
    projectMembershipId: string;
    isTemporary?: boolean | undefined;
    temporaryRange?: string | null | undefined;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
    customRoleId?: string | null | undefined;
}>;
export type TGroupProjectMembershipRoles = z.infer<typeof GroupProjectMembershipRolesSchema>;
export type TGroupProjectMembershipRolesInsert = Omit<z.input<typeof GroupProjectMembershipRolesSchema>, TImmutableDBKeys>;
export type TGroupProjectMembershipRolesUpdate = Partial<Omit<z.input<typeof GroupProjectMembershipRolesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=group-project-membership-roles.d.ts.map