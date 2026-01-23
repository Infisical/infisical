/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateAuthoritySecretSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    caId: z.ZodString;
    encryptedPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedPrivateKey: Buffer;
    caId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedPrivateKey: Buffer;
    caId: string;
}>;
export type TCertificateAuthoritySecret = z.infer<typeof CertificateAuthoritySecretSchema>;
export type TCertificateAuthoritySecretInsert = Omit<z.input<typeof CertificateAuthoritySecretSchema>, TImmutableDBKeys>;
export type TCertificateAuthoritySecretUpdate = Partial<Omit<z.input<typeof CertificateAuthoritySecretSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-authority-secret.d.ts.map