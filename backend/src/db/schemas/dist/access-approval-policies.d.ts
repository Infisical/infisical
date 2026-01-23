import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AccessApprovalPoliciesSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    approvals: z.ZodDefault<z.ZodNumber>;
    secretPath: z.ZodString;
    envId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    enforcementLevel: z.ZodDefault<z.ZodString>;
    deletedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    allowedSelfApprovals: z.ZodDefault<z.ZodBoolean>;
    maxTimePeriod: z.ZodOptional<z.ZodNullable<z.ZodString>>;
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
    maxTimePeriod?: string | null | undefined;
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
    maxTimePeriod?: string | null | undefined;
}>;
export type TAccessApprovalPolicies = z.infer<typeof AccessApprovalPoliciesSchema>;
export type TAccessApprovalPoliciesInsert = Omit<z.input<typeof AccessApprovalPoliciesSchema>, TImmutableDBKeys>;
export type TAccessApprovalPoliciesUpdate = Partial<Omit<z.input<typeof AccessApprovalPoliciesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=access-approval-policies.d.ts.map