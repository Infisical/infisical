import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ExternalGroupOrgRoleMappingsSchema: z.ZodObject<{
    id: z.ZodString;
    groupName: z.ZodString;
    role: z.ZodString;
    roleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    groupName: string;
    role: string;
    roleId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    groupName: string;
    role: string;
    roleId?: string | null | undefined;
}>;
export type TExternalGroupOrgRoleMappings = z.infer<typeof ExternalGroupOrgRoleMappingsSchema>;
export type TExternalGroupOrgRoleMappingsInsert = Omit<z.input<typeof ExternalGroupOrgRoleMappingsSchema>, TImmutableDBKeys>;
export type TExternalGroupOrgRoleMappingsUpdate = Partial<Omit<z.input<typeof ExternalGroupOrgRoleMappingsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=external-group-org-role-mappings.d.ts.map