import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AccessApprovalPoliciesEnvironmentsSchema: z.ZodObject<{
    id: z.ZodString;
    policyId: z.ZodString;
    envId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    envId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    envId: string;
}>;
export type TAccessApprovalPoliciesEnvironments = z.infer<typeof AccessApprovalPoliciesEnvironmentsSchema>;
export type TAccessApprovalPoliciesEnvironmentsInsert = Omit<z.input<typeof AccessApprovalPoliciesEnvironmentsSchema>, TImmutableDBKeys>;
export type TAccessApprovalPoliciesEnvironmentsUpdate = Partial<Omit<z.input<typeof AccessApprovalPoliciesEnvironmentsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=access-approval-policies-environments.d.ts.map