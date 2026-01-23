import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const WorkflowIntegrationsSchema: z.ZodObject<{
    id: z.ZodString;
    integration: z.ZodString;
    slug: z.ZodString;
    orgId: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    status: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    orgId: string;
    slug: string;
    integration: string;
    description?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    slug: string;
    integration: string;
    status?: string | undefined;
    description?: string | null | undefined;
}>;
export type TWorkflowIntegrations = z.infer<typeof WorkflowIntegrationsSchema>;
export type TWorkflowIntegrationsInsert = Omit<z.input<typeof WorkflowIntegrationsSchema>, TImmutableDBKeys>;
export type TWorkflowIntegrationsUpdate = Partial<Omit<z.input<typeof WorkflowIntegrationsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=workflow-integrations.d.ts.map