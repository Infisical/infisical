/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateSecretsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    certId: z.ZodString;
    encryptedPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedPrivateKey: Buffer;
    certId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedPrivateKey: Buffer;
    certId: string;
}>;
export type TCertificateSecrets = z.infer<typeof CertificateSecretsSchema>;
export type TCertificateSecretsInsert = Omit<z.input<typeof CertificateSecretsSchema>, TImmutableDBKeys>;
export type TCertificateSecretsUpdate = Partial<Omit<z.input<typeof CertificateSecretsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-secrets.d.ts.map