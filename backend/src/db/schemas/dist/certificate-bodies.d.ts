/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateBodiesSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    certId: z.ZodString;
    encryptedCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
    encryptedCertificateChain: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedCertificate: Buffer;
    certId: string;
    encryptedCertificateChain?: Buffer | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedCertificate: Buffer;
    certId: string;
    encryptedCertificateChain?: Buffer | null | undefined;
}>;
export type TCertificateBodies = z.infer<typeof CertificateBodiesSchema>;
export type TCertificateBodiesInsert = Omit<z.input<typeof CertificateBodiesSchema>, TImmutableDBKeys>;
export type TCertificateBodiesUpdate = Partial<Omit<z.input<typeof CertificateBodiesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-bodies.d.ts.map