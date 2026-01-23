import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApprovalPolicyStepsSchema: z.ZodObject<{
    id: z.ZodString;
    policyId: z.ZodString;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    stepNumber: z.ZodNumber;
    requiredApprovals: z.ZodNumber;
    notifyApprovers: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    policyId: string;
    stepNumber: number;
    requiredApprovals: number;
    name?: string | null | undefined;
    notifyApprovers?: boolean | null | undefined;
}, {
    id: string;
    policyId: string;
    stepNumber: number;
    requiredApprovals: number;
    name?: string | null | undefined;
    notifyApprovers?: boolean | null | undefined;
}>;
export type TApprovalPolicySteps = z.infer<typeof ApprovalPolicyStepsSchema>;
export type TApprovalPolicyStepsInsert = Omit<z.input<typeof ApprovalPolicyStepsSchema>, TImmutableDBKeys>;
export type TApprovalPolicyStepsUpdate = Partial<Omit<z.input<typeof ApprovalPolicyStepsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=approval-policy-steps.d.ts.map