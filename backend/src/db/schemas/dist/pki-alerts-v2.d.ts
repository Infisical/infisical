import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiAlertsV2Schema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    eventType: z.ZodString;
    alertBefore: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    filters: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    enabled: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    projectId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    eventType: string;
    description?: string | null | undefined;
    enabled?: boolean | null | undefined;
    alertBefore?: string | null | undefined;
    filters?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    eventType: string;
    description?: string | null | undefined;
    enabled?: boolean | null | undefined;
    alertBefore?: string | null | undefined;
    filters?: unknown;
}>;
export type TPkiAlertsV2 = z.infer<typeof PkiAlertsV2Schema>;
export type TPkiAlertsV2Insert = Omit<z.input<typeof PkiAlertsV2Schema>, TImmutableDBKeys>;
export type TPkiAlertsV2Update = Partial<Omit<z.input<typeof PkiAlertsV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-alerts-v2.d.ts.map