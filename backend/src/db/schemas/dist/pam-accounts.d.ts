/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PamAccountsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    folderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    resourceId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedCredentials: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    rotationEnabled: z.ZodDefault<z.ZodBoolean>;
    rotationIntervalSeconds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    lastRotatedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    rotationStatus: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedLastRotationMessage: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    requireMfa: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    encryptedCredentials: Buffer;
    resourceId: string;
    rotationEnabled: boolean;
    description?: string | null | undefined;
    folderId?: string | null | undefined;
    rotationIntervalSeconds?: number | null | undefined;
    lastRotatedAt?: Date | null | undefined;
    rotationStatus?: string | null | undefined;
    encryptedLastRotationMessage?: Buffer | null | undefined;
    requireMfa?: boolean | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    encryptedCredentials: Buffer;
    resourceId: string;
    description?: string | null | undefined;
    folderId?: string | null | undefined;
    rotationEnabled?: boolean | undefined;
    rotationIntervalSeconds?: number | null | undefined;
    lastRotatedAt?: Date | null | undefined;
    rotationStatus?: string | null | undefined;
    encryptedLastRotationMessage?: Buffer | null | undefined;
    requireMfa?: boolean | null | undefined;
}>;
export type TPamAccounts = z.infer<typeof PamAccountsSchema>;
export type TPamAccountsInsert = Omit<z.input<typeof PamAccountsSchema>, TImmutableDBKeys>;
export type TPamAccountsUpdate = Partial<Omit<z.input<typeof PamAccountsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pam-accounts.d.ts.map