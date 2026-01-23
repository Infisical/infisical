import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApprovalRequestStepEligibleApproversSchema: z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    groupId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    stepId: string;
    userId?: string | null | undefined;
    groupId?: string | null | undefined;
}, {
    id: string;
    stepId: string;
    userId?: string | null | undefined;
    groupId?: string | null | undefined;
}>;
export type TApprovalRequestStepEligibleApprovers = z.infer<typeof ApprovalRequestStepEligibleApproversSchema>;
export type TApprovalRequestStepEligibleApproversInsert = Omit<z.input<typeof ApprovalRequestStepEligibleApproversSchema>, TImmutableDBKeys>;
export type TApprovalRequestStepEligibleApproversUpdate = Partial<Omit<z.input<typeof ApprovalRequestStepEligibleApproversSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=approval-request-step-eligible-approvers.d.ts.map