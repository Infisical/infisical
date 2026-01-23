import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ProjectTemplatesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    roles: z.ZodUnknown;
    environments: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    type: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    name: string;
    orgId: string;
    roles?: unknown;
    description?: string | null | undefined;
    environments?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    orgId: string;
    roles?: unknown;
    type?: string | undefined;
    description?: string | null | undefined;
    environments?: unknown;
}>;
export type TProjectTemplates = z.infer<typeof ProjectTemplatesSchema>;
export type TProjectTemplatesInsert = Omit<z.input<typeof ProjectTemplatesSchema>, TImmutableDBKeys>;
export type TProjectTemplatesUpdate = Partial<Omit<z.input<typeof ProjectTemplatesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=project-templates.d.ts.map