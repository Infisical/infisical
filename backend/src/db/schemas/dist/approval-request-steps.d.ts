import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApprovalRequestStepsSchema: z.ZodObject<{
    id: z.ZodString;
    requestId: z.ZodString;
    stepNumber: z.ZodNumber;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodString;
    requiredApprovals: z.ZodNumber;
    notifyApprovers: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    startedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    completedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: string;
    requestId: string;
    stepNumber: number;
    requiredApprovals: number;
    name?: string | null | undefined;
    notifyApprovers?: boolean | null | undefined;
    startedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}, {
    id: string;
    status: string;
    requestId: string;
    stepNumber: number;
    requiredApprovals: number;
    name?: string | null | undefined;
    notifyApprovers?: boolean | null | undefined;
    startedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}>;
export type TApprovalRequestSteps = z.infer<typeof ApprovalRequestStepsSchema>;
export type TApprovalRequestStepsInsert = Omit<z.input<typeof ApprovalRequestStepsSchema>, TImmutableDBKeys>;
export type TApprovalRequestStepsUpdate = Partial<Omit<z.input<typeof ApprovalRequestStepsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=approval-request-steps.d.ts.map