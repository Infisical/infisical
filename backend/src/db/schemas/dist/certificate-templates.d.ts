import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateTemplatesSchema: z.ZodObject<{
    id: z.ZodString;
    caId: z.ZodString;
    pkiCollectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    commonName: z.ZodString;
    subjectAlternativeName: z.ZodString;
    ttl: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    keyUsages: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    extendedKeyUsages: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    caId: string;
    commonName: string;
    subjectAlternativeName: string;
    ttl: string;
    keyUsages?: string[] | null | undefined;
    extendedKeyUsages?: string[] | null | undefined;
    pkiCollectionId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    caId: string;
    commonName: string;
    subjectAlternativeName: string;
    ttl: string;
    keyUsages?: string[] | null | undefined;
    extendedKeyUsages?: string[] | null | undefined;
    pkiCollectionId?: string | null | undefined;
}>;
export type TCertificateTemplates = z.infer<typeof CertificateTemplatesSchema>;
export type TCertificateTemplatesInsert = Omit<z.input<typeof CertificateTemplatesSchema>, TImmutableDBKeys>;
export type TCertificateTemplatesUpdate = Partial<Omit<z.input<typeof CertificateTemplatesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-templates.d.ts.map