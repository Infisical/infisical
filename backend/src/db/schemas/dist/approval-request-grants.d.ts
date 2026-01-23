import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ApprovalRequestGrantsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    requestId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    granteeUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    revokedByUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    revocationReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodString;
    type: z.ZodString;
    attributes: z.ZodUnknown;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    revokedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: string;
    status: string;
    projectId: string;
    createdAt?: Date | null | undefined;
    requestId?: string | null | undefined;
    expiresAt?: Date | null | undefined;
    granteeUserId?: string | null | undefined;
    revokedByUserId?: string | null | undefined;
    revocationReason?: string | null | undefined;
    attributes?: unknown;
    revokedAt?: Date | null | undefined;
}, {
    id: string;
    type: string;
    status: string;
    projectId: string;
    createdAt?: Date | null | undefined;
    requestId?: string | null | undefined;
    expiresAt?: Date | null | undefined;
    granteeUserId?: string | null | undefined;
    revokedByUserId?: string | null | undefined;
    revocationReason?: string | null | undefined;
    attributes?: unknown;
    revokedAt?: Date | null | undefined;
}>;
export type TApprovalRequestGrants = z.infer<typeof ApprovalRequestGrantsSchema>;
export type TApprovalRequestGrantsInsert = Omit<z.input<typeof ApprovalRequestGrantsSchema>, TImmutableDBKeys>;
export type TApprovalRequestGrantsUpdate = Partial<Omit<z.input<typeof ApprovalRequestGrantsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=approval-request-grants.d.ts.map