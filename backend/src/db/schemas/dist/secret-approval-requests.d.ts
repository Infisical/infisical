import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalRequestsSchema: z.ZodObject<{
    id: z.ZodString;
    policyId: z.ZodString;
    hasMerged: z.ZodDefault<z.ZodBoolean>;
    status: z.ZodDefault<z.ZodString>;
    conflicts: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    slug: z.ZodString;
    folderId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    isReplicated: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    committerUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    statusChangedByUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bypassReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    policyId: string;
    folderId: string;
    slug: string;
    hasMerged: boolean;
    conflicts?: unknown;
    isReplicated?: boolean | null | undefined;
    committerUserId?: string | null | undefined;
    statusChangedByUserId?: string | null | undefined;
    bypassReason?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    policyId: string;
    folderId: string;
    slug: string;
    status?: string | undefined;
    hasMerged?: boolean | undefined;
    conflicts?: unknown;
    isReplicated?: boolean | null | undefined;
    committerUserId?: string | null | undefined;
    statusChangedByUserId?: string | null | undefined;
    bypassReason?: string | null | undefined;
}>;
export type TSecretApprovalRequests = z.infer<typeof SecretApprovalRequestsSchema>;
export type TSecretApprovalRequestsInsert = Omit<z.input<typeof SecretApprovalRequestsSchema>, TImmutableDBKeys>;
export type TSecretApprovalRequestsUpdate = Partial<Omit<z.input<typeof SecretApprovalRequestsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-requests.d.ts.map