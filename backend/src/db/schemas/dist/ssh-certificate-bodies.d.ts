/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshCertificateBodiesSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    sshCertId: z.ZodString;
    encryptedCertificate: z.ZodType<Buffer, z.ZodTypeDef, Buffer>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedCertificate: Buffer;
    sshCertId: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    encryptedCertificate: Buffer;
    sshCertId: string;
}>;
export type TSshCertificateBodies = z.infer<typeof SshCertificateBodiesSchema>;
export type TSshCertificateBodiesInsert = Omit<z.input<typeof SshCertificateBodiesSchema>, TImmutableDBKeys>;
export type TSshCertificateBodiesUpdate = Partial<Omit<z.input<typeof SshCertificateBodiesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-certificate-bodies.d.ts.map