/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretsV2Schema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodDefault<z.ZodNumber>;
    type: z.ZodDefault<z.ZodString>;
    key: z.ZodString;
    encryptedValue: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    encryptedComment: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    reminderNote: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reminderRepeatDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    skipMultilineEncoding: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    folderId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    version: number;
    folderId: string;
    key: string;
    userId?: string | null | undefined;
    metadata?: unknown;
    encryptedValue?: Buffer | null | undefined;
    skipMultilineEncoding?: boolean | null | undefined;
    encryptedComment?: Buffer | null | undefined;
    reminderNote?: string | null | undefined;
    reminderRepeatDays?: number | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderId: string;
    key: string;
    type?: string | undefined;
    userId?: string | null | undefined;
    version?: number | undefined;
    metadata?: unknown;
    encryptedValue?: Buffer | null | undefined;
    skipMultilineEncoding?: boolean | null | undefined;
    encryptedComment?: Buffer | null | undefined;
    reminderNote?: string | null | undefined;
    reminderRepeatDays?: number | null | undefined;
}>;
export type TSecretsV2 = z.infer<typeof SecretsV2Schema>;
export type TSecretsV2Insert = Omit<z.input<typeof SecretsV2Schema>, TImmutableDBKeys>;
export type TSecretsV2Update = Partial<Omit<z.input<typeof SecretsV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=secrets-v2.d.ts.map