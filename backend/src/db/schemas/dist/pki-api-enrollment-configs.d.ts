import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiApiEnrollmentConfigsSchema: z.ZodObject<{
    id: z.ZodString;
    autoRenew: z.ZodOptional<z.ZodNullable<z.ZodDefault<z.ZodBoolean>>>;
    renewBeforeDays: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    renewBeforeDays?: number | null | undefined;
    autoRenew?: boolean | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    renewBeforeDays?: number | null | undefined;
    autoRenew?: boolean | null | undefined;
}>;
export type TPkiApiEnrollmentConfigs = z.infer<typeof PkiApiEnrollmentConfigsSchema>;
export type TPkiApiEnrollmentConfigsInsert = Omit<z.input<typeof PkiApiEnrollmentConfigsSchema>, TImmutableDBKeys>;
export type TPkiApiEnrollmentConfigsUpdate = Partial<Omit<z.input<typeof PkiApiEnrollmentConfigsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-api-enrollment-configs.d.ts.map