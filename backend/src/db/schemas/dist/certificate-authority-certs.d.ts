/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateAuthorityCertsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    caId: z.ZodString;
    encryptedCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedCertificateChain: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    version: z.ZodNumber;
    caSecretId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    caId: string;
    encryptedCertificate: Buffer;
    encryptedCertificateChain: Buffer;
    caSecretId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
    caId: string;
    encryptedCertificate: Buffer;
    encryptedCertificateChain: Buffer;
    caSecretId: string;
}>;
export type TCertificateAuthorityCerts = z.infer<typeof CertificateAuthorityCertsSchema>;
export type TCertificateAuthorityCertsInsert = Omit<z.input<typeof CertificateAuthorityCertsSchema>, TImmutableDBKeys>;
export type TCertificateAuthorityCertsUpdate = Partial<Omit<z.input<typeof CertificateAuthorityCertsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-authority-certs.d.ts.map