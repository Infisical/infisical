import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAlertsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    pkiCollectionId: z.ZodString;
    name: z.ZodString;
    alertBeforeDays: z.ZodNumber;
    recipientEmails: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    pkiCollectionId: string;
    alertBeforeDays: number;
    recipientEmails: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    pkiCollectionId: string;
    alertBeforeDays: number;
    recipientEmails: string;
}>;
export type TPkiAlerts = z.infer<typeof PkiAlertsSchema>;
export type TPkiAlertsInsert = Omit<z.input<typeof PkiAlertsSchema>, TImmutableDBKeys>;
export type TPkiAlertsUpdate = Partial<Omit<z.input<typeof PkiAlertsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-alerts.d.ts.map