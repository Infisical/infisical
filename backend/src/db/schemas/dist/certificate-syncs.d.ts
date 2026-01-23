import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateSyncsSchema: z.ZodObject<{
    id: z.ZodString;
    pkiSyncId: z.ZodString;
    certificateId: z.ZodString;
    syncStatus: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodString>>>;
    lastSyncMessage: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lastSyncedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    externalIdentifier: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    certificateId: string;
    pkiSyncId: string;
    syncStatus?: string | null | undefined;
    lastSyncMessage?: string | null | undefined;
    lastSyncedAt?: Date | null | undefined;
    externalIdentifier?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    certificateId: string;
    pkiSyncId: string;
    syncStatus?: string | null | undefined;
    lastSyncMessage?: string | null | undefined;
    lastSyncedAt?: Date | null | undefined;
    externalIdentifier?: string | null | undefined;
}>;
export type TCertificateSyncs = z.infer<typeof CertificateSyncsSchema>;
export type TCertificateSyncsInsert = Omit<z.input<typeof CertificateSyncsSchema>, TImmutableDBKeys>;
export type TCertificateSyncsUpdate = Partial<Omit<z.input<typeof CertificateSyncsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-syncs.d.ts.map