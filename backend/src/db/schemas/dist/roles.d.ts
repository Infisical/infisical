import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const RolesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    slug: z.ZodString;
    permissions: z.ZodUnknown;
    orgId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    projectId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    namespaceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    slug: string;
    permissions?: unknown;
    orgId?: string | null | undefined;
    projectId?: string | null | undefined;
    namespaceId?: string | null | undefined;
    description?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    slug: string;
    permissions?: unknown;
    orgId?: string | null | undefined;
    projectId?: string | null | undefined;
    namespaceId?: string | null | undefined;
    description?: string | null | undefined;
}>;
export type TRoles = z.infer<typeof RolesSchema>;
export type TRolesInsert = Omit<z.input<typeof RolesSchema>, TImmutableDBKeys>;
export type TRolesUpdate = Partial<Omit<z.input<typeof RolesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=roles.d.ts.map