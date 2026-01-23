/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretApprovalRequestsSecretsV2Schema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodNumber>>>;
    key: z.ZodString;
    encryptedValue: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    encryptedComment: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    reminderNote: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reminderRepeatDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    skipMultilineEncoding: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    requestId: z.ZodString;
    op: z.ZodString;
    secretId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    secretVersion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    secretMetadata: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    requestId: string;
    key: string;
    op: string;
    version?: number | null | undefined;
    metadata?: unknown;
    secretId?: string | null | undefined;
    encryptedValue?: Buffer | null | undefined;
    skipMultilineEncoding?: boolean | null | undefined;
    secretVersion?: string | null | undefined;
    encryptedComment?: Buffer | null | undefined;
    reminderNote?: string | null | undefined;
    reminderRepeatDays?: number | null | undefined;
    secretMetadata?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    requestId: string;
    key: string;
    op: string;
    version?: number | null | undefined;
    metadata?: unknown;
    secretId?: string | null | undefined;
    encryptedValue?: Buffer | null | undefined;
    skipMultilineEncoding?: boolean | null | undefined;
    secretVersion?: string | null | undefined;
    encryptedComment?: Buffer | null | undefined;
    reminderNote?: string | null | undefined;
    reminderRepeatDays?: number | null | undefined;
    secretMetadata?: unknown;
}>;
export type TSecretApprovalRequestsSecretsV2 = z.infer<typeof SecretApprovalRequestsSecretsV2Schema>;
export type TSecretApprovalRequestsSecretsV2Insert = Omit<z.input<typeof SecretApprovalRequestsSecretsV2Schema>, TImmutableDBKeys>;
export type TSecretApprovalRequestsSecretsV2Update = Partial<Omit<z.input<typeof SecretApprovalRequestsSecretsV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-approval-requests-secrets-v2.d.ts.map