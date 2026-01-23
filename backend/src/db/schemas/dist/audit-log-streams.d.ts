/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const AuditLogStreamsSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedHeadersCiphertext: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedHeadersIV: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedHeadersTag: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedHeadersAlgorithm: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    encryptedHeadersKeyEncoding: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    orgId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    provider: z.ZodDefault<z.ZodString>;
    encryptedCredentials: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    encryptedCredentials: Buffer;
    provider: string;
    url?: string | null | undefined;
    encryptedHeadersCiphertext?: string | null | undefined;
    encryptedHeadersIV?: string | null | undefined;
    encryptedHeadersTag?: string | null | undefined;
    encryptedHeadersAlgorithm?: string | null | undefined;
    encryptedHeadersKeyEncoding?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    orgId: string;
    encryptedCredentials: Buffer;
    url?: string | null | undefined;
    encryptedHeadersCiphertext?: string | null | undefined;
    encryptedHeadersIV?: string | null | undefined;
    encryptedHeadersTag?: string | null | undefined;
    encryptedHeadersAlgorithm?: string | null | undefined;
    encryptedHeadersKeyEncoding?: string | null | undefined;
    provider?: string | undefined;
}>;
export type TAuditLogStreams = z.infer<typeof AuditLogStreamsSchema>;
export type TAuditLogStreamsInsert = Omit<z.input<typeof AuditLogStreamsSchema>, TImmutableDBKeys>;
export type TAuditLogStreamsUpdate = Partial<Omit<z.input<typeof AuditLogStreamsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=audit-log-streams.d.ts.map