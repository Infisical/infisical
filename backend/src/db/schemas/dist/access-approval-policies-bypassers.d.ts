import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AccessApprovalPoliciesBypassersSchema: z.ZodObject<{
    id: z.ZodString;
    bypasserGroupId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bypasserUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    policyId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    bypasserGroupId?: string | null | undefined;
    bypasserUserId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    bypasserGroupId?: string | null | undefined;
    bypasserUserId?: string | null | undefined;
}>;
export type TAccessApprovalPoliciesBypassers = z.infer<typeof AccessApprovalPoliciesBypassersSchema>;
export type TAccessApprovalPoliciesBypassersInsert = Omit<z.input<typeof AccessApprovalPoliciesBypassersSchema>, TImmutableDBKeys>;
export type TAccessApprovalPoliciesBypassersUpdate = Partial<Omit<z.input<typeof AccessApprovalPoliciesBypassersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=access-approval-policies-bypassers.d.ts.map