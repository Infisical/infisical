import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalRequestsReviewersSchema: z.ZodObject<{
    id: z.ZodString;
    status: z.ZodString;
    requestId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    reviewerUserId: z.ZodString;
    comment: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    requestId: string;
    reviewerUserId: string;
    comment?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    requestId: string;
    reviewerUserId: string;
    comment?: string | null | undefined;
}>;
export type TSecretApprovalRequestsReviewers = z.infer<typeof SecretApprovalRequestsReviewersSchema>;
export type TSecretApprovalRequestsReviewersInsert = Omit<z.input<typeof SecretApprovalRequestsReviewersSchema>, TImmutableDBKeys>;
export type TSecretApprovalRequestsReviewersUpdate = Partial<Omit<z.input<typeof SecretApprovalRequestsReviewersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-requests-reviewers.d.ts.map