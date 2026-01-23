import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const OrgRolesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    slug: z.ZodString;
    permissions: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    orgId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    slug: string;
    permissions?: unknown;
    description?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    slug: string;
    permissions?: unknown;
    description?: string | null | undefined;
}>;
export type TOrgRoles = z.infer<typeof OrgRolesSchema>;
export type TOrgRolesInsert = Omit<z.input<typeof OrgRolesSchema>, TImmutableDBKeys>;
export type TOrgRolesUpdate = Partial<Omit<z.input<typeof OrgRolesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=org-roles.d.ts.map