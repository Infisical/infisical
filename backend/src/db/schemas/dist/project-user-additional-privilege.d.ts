import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectUserAdditionalPrivilegeSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    projectMembershipId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isTemporary: z.ZodDefault<z.ZodBoolean>;
    temporaryMode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryRange: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temporaryAccessStartTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    temporaryAccessEndTime: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    permissions: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userId: z.ZodString;
    projectId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isTemporary: boolean;
    projectId: string;
    userId: string;
    slug: string;
    temporaryRange?: string | null | undefined;
    permissions?: unknown;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
    projectMembershipId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    userId: string;
    slug: string;
    isTemporary?: boolean | undefined;
    temporaryRange?: string | null | undefined;
    permissions?: unknown;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
    projectMembershipId?: string | null | undefined;
}>;
export type TProjectUserAdditionalPrivilege = z.infer<typeof ProjectUserAdditionalPrivilegeSchema>;
export type TProjectUserAdditionalPrivilegeInsert = Omit<z.input<typeof ProjectUserAdditionalPrivilegeSchema>, TImmutableDBKeys>;
export type TProjectUserAdditionalPrivilegeUpdate = Partial<Omit<z.input<typeof ProjectUserAdditionalPrivilegeSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-user-additional-privilege.d.ts.map