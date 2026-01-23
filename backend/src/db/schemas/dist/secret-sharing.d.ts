/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretSharingSchema: z.ZodObject<{
    id: z.ZodString;
    encryptedValue: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    iv: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    tag: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    hashedHex: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expiresAt: z.ZodDate;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    expiresAfterViews: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    accessType: z.ZodDefault<z.ZodString>;
    name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastViewedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    password: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedSecret: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    identifier: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodDefault<z.ZodString>;
    authorizedEmails: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    type: string;
    expiresAt: Date;
    accessType: string;
    name?: string | null | undefined;
    orgId?: string | null | undefined;
    userId?: string | null | undefined;
    iv?: string | null | undefined;
    tag?: string | null | undefined;
    encryptedValue?: string | null | undefined;
    hashedHex?: string | null | undefined;
    expiresAfterViews?: number | null | undefined;
    lastViewedAt?: Date | null | undefined;
    password?: string | null | undefined;
    encryptedSecret?: Buffer | null | undefined;
    identifier?: string | null | undefined;
    authorizedEmails?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    type?: string | undefined;
    name?: string | null | undefined;
    orgId?: string | null | undefined;
    userId?: string | null | undefined;
    iv?: string | null | undefined;
    tag?: string | null | undefined;
    encryptedValue?: string | null | undefined;
    hashedHex?: string | null | undefined;
    expiresAfterViews?: number | null | undefined;
    accessType?: string | undefined;
    lastViewedAt?: Date | null | undefined;
    password?: string | null | undefined;
    encryptedSecret?: Buffer | null | undefined;
    identifier?: string | null | undefined;
    authorizedEmails?: unknown;
}>;
export type TSecretSharing = z.infer<typeof SecretSharingSchema>;
export type TSecretSharingInsert = Omit<z.input<typeof SecretSharingSchema>, TImmutableDBKeys>;
export type TSecretSharingUpdate = Partial<Omit<z.input<typeof SecretSharingSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-sharing.d.ts.map