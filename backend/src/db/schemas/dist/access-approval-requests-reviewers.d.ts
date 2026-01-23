import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AccessApprovalRequestsReviewersSchema: z.ZodObject<{
    id: z.ZodString;
    status: z.ZodString;
    requestId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    reviewerUserId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    requestId: string;
    reviewerUserId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    requestId: string;
    reviewerUserId: string;
}>;
export type TAccessApprovalRequestsReviewers = z.infer<typeof AccessApprovalRequestsReviewersSchema>;
export type TAccessApprovalRequestsReviewersInsert = Omit<z.input<typeof AccessApprovalRequestsReviewersSchema>, TImmutableDBKeys>;
export type TAccessApprovalRequestsReviewersUpdate = Partial<Omit<z.input<typeof AccessApprovalRequestsReviewersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=access-approval-requests-reviewers.d.ts.map