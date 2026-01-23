import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAlertHistorySchema: z.ZodObject<{
    id: z.ZodString;
    alertId: z.ZodString;
    triggeredAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    hasNotificationSent: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    notificationError: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    alertId: string;
    triggeredAt?: Date | null | undefined;
    hasNotificationSent?: boolean | null | undefined;
    notificationError?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    alertId: string;
    triggeredAt?: Date | null | undefined;
    hasNotificationSent?: boolean | null | undefined;
    notificationError?: string | null | undefined;
}>;
export type TPkiAlertHistory = z.infer<typeof PkiAlertHistorySchema>;
export type TPkiAlertHistoryInsert = Omit<z.input<typeof PkiAlertHistorySchema>, TImmutableDBKeys>;
export type TPkiAlertHistoryUpdate = Partial<Omit<z.input<typeof PkiAlertHistorySchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-alert-history.d.ts.map