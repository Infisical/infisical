/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretVersionsV2Schema: z.ZodObject<{
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
    envId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    secretId: z.ZodString;
    folderId: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    userActorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    identityActorId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    actorType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    version: number;
    folderId: string;
    key: string;
    secretId: string;
    envId?: string | null | undefined;
    userId?: string | null | undefined;
    metadata?: unknown;
    actorType?: string | null | undefined;
    encryptedValue?: Buffer | null | undefined;
    skipMultilineEncoding?: boolean | null | undefined;
    encryptedComment?: Buffer | null | undefined;
    reminderNote?: string | null | undefined;
    reminderRepeatDays?: number | null | undefined;
    userActorId?: string | null | undefined;
    identityActorId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    folderId: string;
    key: string;
    secretId: string;
    type?: string | undefined;
    envId?: string | null | undefined;
    userId?: string | null | undefined;
    version?: number | undefined;
    metadata?: unknown;
    actorType?: string | null | undefined;
    encryptedValue?: Buffer | null | undefined;
    skipMultilineEncoding?: boolean | null | undefined;
    encryptedComment?: Buffer | null | undefined;
    reminderNote?: string | null | undefined;
    reminderRepeatDays?: number | null | undefined;
    userActorId?: string | null | undefined;
    identityActorId?: string | null | undefined;
}>;
export type TSecretVersionsV2 = z.infer<typeof SecretVersionsV2Schema>;
export type TSecretVersionsV2Insert = Omit<z.input<typeof SecretVersionsV2Schema>, TImmutableDBKeys>;
export type TSecretVersionsV2Update = Partial<Omit<z.input<typeof SecretVersionsV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-versions-v2.d.ts.map