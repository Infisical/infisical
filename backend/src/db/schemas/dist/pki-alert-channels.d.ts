import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAlertChannelsSchema: z.ZodObject<{
    id: z.ZodString;
    alertId: z.ZodString;
    channelType: z.ZodString;
    config: z.ZodUnknown;
    enabled: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    alertId: string;
    channelType: string;
    config?: unknown;
    enabled?: boolean | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    alertId: string;
    channelType: string;
    config?: unknown;
    enabled?: boolean | null | undefined;
}>;
export type TPkiAlertChannels = z.infer<typeof PkiAlertChannelsSchema>;
export type TPkiAlertChannelsInsert = Omit<z.input<typeof PkiAlertChannelsSchema>, TImmutableDBKeys>;
export type TPkiAlertChannelsUpdate = Partial<Omit<z.input<typeof PkiAlertChannelsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-alert-channels.d.ts.map