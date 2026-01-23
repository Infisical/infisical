import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApprovalPoliciesSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    organizationId: z.ZodString;
    type: z.ZodString;
    name: z.ZodString;
    isActive: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    maxRequestTtl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    conditions: z.ZodUnknown;
    constraints: z.ZodUnknown;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    name: string;
    projectId: string;
    organizationId: string;
    isActive?: boolean | null | undefined;
    maxRequestTtl?: string | null | undefined;
    conditions?: unknown;
    constraints?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    name: string;
    projectId: string;
    organizationId: string;
    isActive?: boolean | null | undefined;
    maxRequestTtl?: string | null | undefined;
    conditions?: unknown;
    constraints?: unknown;
}>;
export type TApprovalPolicies = z.infer<typeof ApprovalPoliciesSchema>;
export type TApprovalPoliciesInsert = Omit<z.input<typeof ApprovalPoliciesSchema>, TImmutableDBKeys>;
export type TApprovalPoliciesUpdate = Partial<Omit<z.input<typeof ApprovalPoliciesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=approval-policies.d.ts.map