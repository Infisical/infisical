import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalPoliciesEnvironmentsSchema: z.ZodObject<{
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
export type TSecretApprovalPoliciesEnvironments = z.infer<typeof SecretApprovalPoliciesEnvironmentsSchema>;
export type TSecretApprovalPoliciesEnvironmentsInsert = Omit<z.input<typeof SecretApprovalPoliciesEnvironmentsSchema>, TImmutableDBKeys>;
export type TSecretApprovalPoliciesEnvironmentsUpdate = Partial<Omit<z.input<typeof SecretApprovalPoliciesEnvironmentsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-policies-environments.d.ts.map