import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalPoliciesBypassersSchema: z.ZodObject<{
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
export type TSecretApprovalPoliciesBypassers = z.infer<typeof SecretApprovalPoliciesBypassersSchema>;
export type TSecretApprovalPoliciesBypassersInsert = Omit<z.input<typeof SecretApprovalPoliciesBypassersSchema>, TImmutableDBKeys>;
export type TSecretApprovalPoliciesBypassersUpdate = Partial<Omit<z.input<typeof SecretApprovalPoliciesBypassersSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-policies-bypassers.d.ts.map