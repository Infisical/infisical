/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshCertificateAuthoritySecretsSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    sshCaId: z.ZodString;
    encryptedPrivateKey: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedPrivateKey: Buffer;
    sshCaId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedPrivateKey: Buffer;
    sshCaId: string;
}>;
export type TSshCertificateAuthoritySecrets = z.infer<typeof SshCertificateAuthoritySecretsSchema>;
export type TSshCertificateAuthoritySecretsInsert = Omit<z.input<typeof SshCertificateAuthoritySecretsSchema>, TImmutableDBKeys>;
export type TSshCertificateAuthoritySecretsUpdate = Partial<Omit<z.input<typeof SshCertificateAuthoritySecretsSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-certificate-authority-secrets.d.ts.map