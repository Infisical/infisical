import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const PkiCertificatePoliciesSchema: z.ZodObject<{
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
export type TPkiCertificatePolicies = z.infer<typeof PkiCertificatePoliciesSchema>;
export type TPkiCertificatePoliciesInsert = Omit<z.input<typeof PkiCertificatePoliciesSchema>, TImmutableDBKeys>;
export type TPkiCertificatePoliciesUpdate = Partial<Omit<z.input<typeof PkiCertificatePoliciesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=pki-certificate-policies.d.ts.map