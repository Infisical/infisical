import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiCertificateTemplatesV2Schema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    subject: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    sans: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    keyUsages: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    extendedKeyUsages: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    algorithms: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    validity: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    basicConstraints: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    description?: string | null | undefined;
    keyUsages?: unknown;
    extendedKeyUsages?: unknown;
    basicConstraints?: unknown;
    subject?: unknown;
    sans?: unknown;
    algorithms?: unknown;
    validity?: unknown;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    projectId: string;
    description?: string | null | undefined;
    keyUsages?: unknown;
    extendedKeyUsages?: unknown;
    basicConstraints?: unknown;
    subject?: unknown;
    sans?: unknown;
    algorithms?: unknown;
    validity?: unknown;
}>;
export type TPkiCertificateTemplatesV2 = z.infer<typeof PkiCertificateTemplatesV2Schema>;
export type TPkiCertificateTemplatesV2Insert = Omit<z.input<typeof PkiCertificateTemplatesV2Schema>, TImmutableDBKeys>;
export type TPkiCertificateTemplatesV2Update = Partial<Omit<z.input<typeof PkiCertificateTemplatesV2Schema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-certificate-templates-v2.d.ts.map