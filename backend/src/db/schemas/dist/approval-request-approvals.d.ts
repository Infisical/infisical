import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApprovalRequestApprovalsSchema: z.ZodObject<{
    id: z.ZodString;
    stepId: z.ZodString;
    approverUserId: z.ZodString;
    decision: z.ZodString;
    comment: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    approverUserId: string;
    stepId: string;
    decision: string;
    createdAt?: Date | null | undefined;
    comment?: string | null | undefined;
}, {
    id: string;
    approverUserId: string;
    stepId: string;
    decision: string;
    createdAt?: Date | null | undefined;
    comment?: string | null | undefined;
}>;
export type TApprovalRequestApprovals = z.infer<typeof ApprovalRequestApprovalsSchema>;
export type TApprovalRequestApprovalsInsert = Omit<z.input<typeof ApprovalRequestApprovalsSchema>, TImmutableDBKeys>;
export type TApprovalRequestApprovalsUpdate = Partial<Omit<z.input<typeof ApprovalRequestApprovalsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=approval-request-approvals.d.ts.map