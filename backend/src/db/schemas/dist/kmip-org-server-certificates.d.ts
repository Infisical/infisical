/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const KmipOrgServerCertificatesSchema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    commonName: z.ZodString;
    altNames: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    serialNumber: z.ZodString;
    keyAlgorithm: z.ZodString;
    issuedAt: z.ZodDate;
    expiration: z.ZodDate;
    encryptedCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedChain: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    orgId: string;
    encryptedCertificate: Buffer;
    commonName: string;
    keyAlgorithm: string;
    serialNumber: string;
    issuedAt: Date;
    expiration: Date;
    encryptedChain: Buffer;
    altNames?: string | null | undefined;
}, {
    id: string;
    orgId: string;
    encryptedCertificate: Buffer;
    commonName: string;
    keyAlgorithm: string;
    serialNumber: string;
    issuedAt: Date;
    expiration: Date;
    encryptedChain: Buffer;
    altNames?: string | null | undefined;
}>;
export type TKmipOrgServerCertificates = z.infer<typeof KmipOrgServerCertificatesSchema>;
export type TKmipOrgServerCertificatesInsert = Omit<z.input<typeof KmipOrgServerCertificatesSchema>, TImmutableDBKeys>;
export type TKmipOrgServerCertificatesUpdate = Partial<Omit<z.input<typeof KmipOrgServerCertificatesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=kmip-org-server-certificates.d.ts.map