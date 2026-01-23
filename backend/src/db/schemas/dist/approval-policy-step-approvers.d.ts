import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApprovalPolicyStepApproversSchema: z.ZodObject<{
    id: z.ZodString;
    policyStepId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    groupId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    policyStepId: string;
    userId?: string | null | undefined;
    groupId?: string | null | undefined;
}, {
    id: string;
    policyStepId: string;
    userId?: string | null | undefined;
    groupId?: string | null | undefined;
}>;
export type TApprovalPolicyStepApprovers = z.infer<typeof ApprovalPolicyStepApproversSchema>;
export type TApprovalPolicyStepApproversInsert = Omit<z.input<typeof ApprovalPolicyStepApproversSchema>, TImmutableDBKeys>;
export type TApprovalPolicyStepApproversUpdate = Partial<Omit<z.input<typeof ApprovalPolicyStepApproversSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=approval-policy-step-approvers.d.ts.map