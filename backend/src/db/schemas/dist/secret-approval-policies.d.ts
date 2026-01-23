import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalPoliciesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    secretPath: z.ZodString;
    approvals: z.ZodDefault<z.ZodNumber>;
    envId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    enforcementLevel: z.ZodDefault<z.ZodString>;
    deletedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    allowedSelfApprovals: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    secretPath: string;
    envId: string;
    name: string;
    approvals: number;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    deletedAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    secretPath: string;
    envId: string;
    name: string;
    approvals?: number | undefined;
    enforcementLevel?: string | undefined;
    deletedAt?: Date | null | undefined;
    allowedSelfApprovals?: boolean | undefined;
}>;
export type TSecretApprovalPolicies = z.infer<typeof SecretApprovalPoliciesSchema>;
export type TSecretApprovalPoliciesInsert = Omit<z.input<typeof SecretApprovalPoliciesSchema>, TImmutableDBKeys>;
export type TSecretApprovalPoliciesUpdate = Partial<Omit<z.input<typeof SecretApprovalPoliciesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-policies.d.ts.map