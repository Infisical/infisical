import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAlertHistoryCertificateSchema: z.ZodObject<{
    id: z.ZodString;
    alertHistoryId: z.ZodString;
    certificateId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    certificateId: string;
    alertHistoryId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    certificateId: string;
    alertHistoryId: string;
}>;
export type TPkiAlertHistoryCertificate = z.infer<typeof PkiAlertHistoryCertificateSchema>;
export type TPkiAlertHistoryCertificateInsert = Omit<z.input<typeof PkiAlertHistoryCertificateSchema>, TImmutableDBKeys>;
export type TPkiAlertHistoryCertificateUpdate = Partial<Omit<z.input<typeof PkiAlertHistoryCertificateSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-alert-history-certificate.d.ts.map