/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateAuthorityCrlSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    caId: z.ZodString;
    encryptedCrl: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    caSecretId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    caId: string;
    caSecretId: string;
    encryptedCrl: Buffer;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    caId: string;
    caSecretId: string;
    encryptedCrl: Buffer;
}>;
export type TCertificateAuthorityCrl = z.infer<typeof CertificateAuthorityCrlSchema>;
export type TCertificateAuthorityCrlInsert = Omit<z.input<typeof CertificateAuthorityCrlSchema>, TImmutableDBKeys>;
export type TCertificateAuthorityCrlUpdate = Partial<Omit<z.input<typeof CertificateAuthorityCrlSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-authority-crl.d.ts.map