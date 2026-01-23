import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SecretScanningScansSchema: z.ZodObject<{
    id: z.ZodString;
    status: z.ZodDefault<z.ZodString>;
    statusMessage: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    type: z.ZodString;
    resourceId: z.ZodString;
    createdAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: string;
    status: string;
    resourceId: string;
    createdAt?: Date | null | undefined;
    statusMessage?: string | null | undefined;
}, {
    id: string;
    type: string;
    resourceId: string;
    createdAt?: Date | null | undefined;
    status?: string | undefined;
    statusMessage?: string | null | undefined;
}>;
export type TSecretScanningScans = z.infer<typeof SecretScanningScansSchema>;
export type TSecretScanningScansInsert = Omit<z.input<typeof SecretScanningScansSchema>, TImmutableDBKeys>;
export type TSecretScanningScansUpdate = Partial<Omit<z.input<typeof SecretScanningScansSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=secret-scanning-scans.d.ts.map