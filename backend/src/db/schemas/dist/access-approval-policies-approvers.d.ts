import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AccessApprovalPoliciesApproversSchema: z.ZodObject<{
    id: z.ZodString;
    policyId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    approverUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    approverGroupId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sequence: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>;
    approvalsRequired: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    approverUserId?: string | null | undefined;
    approverGroupId?: string | null | undefined;
    sequence?: number | null | undefined;
    approvalsRequired?: number | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    approverUserId?: string | null | undefined;
    approverGroupId?: string | null | undefined;
    sequence?: number | null | undefined;
    approvalsRequired?: number | null | undefined;
}>;
export type TAccessApprovalPoliciesApprovers = z.infer<typeof AccessApprovalPoliciesApproversSchema>;
export type TAccessApprovalPoliciesApproversInsert = Omit<z.input<typeof AccessApprovalPoliciesApproversSchema>, TImmutableDBKeys>;
export type TAccessApprovalPoliciesApproversUpdate = Partial<Omit<z.input<typeof AccessApprovalPoliciesApproversSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=access-approval-policies-approvers.d.ts.map