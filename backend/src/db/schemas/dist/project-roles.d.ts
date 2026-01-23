import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectRolesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    slug: z.ZodString;
    permissions: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    version: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    version: number;
    slug: string;
    permissions?: unknown;
    description?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    slug: string;
    permissions?: unknown;
    description?: string | null | undefined;
    version?: number | undefined;
}>;
export type TProjectRoles = z.infer<typeof ProjectRolesSchema>;
export type TProjectRolesInsert = Omit<z.input<typeof ProjectRolesSchema>, TImmutableDBKeys>;
export type TProjectRolesUpdate = Partial<Omit<z.input<typeof ProjectRolesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-roles.d.ts.map