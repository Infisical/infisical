import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalPoliciesApproversSchema: z.ZodObject<{
    id: z.ZodString;
    policyId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    approverUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    approverGroupId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    approverUserId?: string | null | undefined;
    approverGroupId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    approverUserId?: string | null | undefined;
    approverGroupId?: string | null | undefined;
}>;
export type TSecretApprovalPoliciesApprovers = z.infer<typeof SecretApprovalPoliciesApproversSchema>;
export type TSecretApprovalPoliciesApproversInsert = Omit<z.input<typeof SecretApprovalPoliciesApproversSchema>, TImmutableDBKeys>;
export type TSecretApprovalPoliciesApproversUpdate = Partial<Omit<z.input<typeof SecretApprovalPoliciesApproversSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-policies-approvers.d.ts.map