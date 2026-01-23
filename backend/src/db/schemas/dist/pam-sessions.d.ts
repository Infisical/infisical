/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PamSessionsSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    accountId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    resourceType: z.ZodString;
    resourceName: z.ZodString;
    accountName: z.ZodString;
    userId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    actorName: z.ZodString;
    actorEmail: z.ZodString;
    actorIp: z.ZodString;
    actorUserAgent: z.ZodString;
    status: z.ZodString;
    encryptedLogsBlob: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    expiresAt: z.ZodDate;
    startedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    endedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    projectId: string;
    expiresAt: Date;
    resourceType: string;
    resourceName: string;
    accountName: string;
    actorName: string;
    actorEmail: string;
    actorIp: string;
    actorUserAgent: string;
    userId?: string | null | undefined;
    startedAt?: Date | null | undefined;
    accountId?: string | null | undefined;
    encryptedLogsBlob?: Buffer | null | undefined;
    endedAt?: Date | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    projectId: string;
    expiresAt: Date;
    resourceType: string;
    resourceName: string;
    accountName: string;
    actorName: string;
    actorEmail: string;
    actorIp: string;
    actorUserAgent: string;
    userId?: string | null | undefined;
    startedAt?: Date | null | undefined;
    accountId?: string | null | undefined;
    encryptedLogsBlob?: Buffer | null | undefined;
    endedAt?: Date | null | undefined;
}>;
export type TPamSessions = z.infer<typeof PamSessionsSchema>;
export type TPamSessionsInsert = Omit<z.input<typeof PamSessionsSchema>, TImmutableDBKeys>;
export type TPamSessionsUpdate = Partial<Omit<z.input<typeof PamSessionsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pam-sessions.d.ts.map