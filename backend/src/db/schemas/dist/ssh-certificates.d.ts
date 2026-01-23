import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshCertificatesSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    sshCaId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sshCertificateTemplateId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    serialNumber: z.ZodString;
    certType: z.ZodString;
    principals: z.ZodArray<z.ZodString, "many">;
    keyId: z.ZodString;
    notBefore: z.ZodDate;
    notAfter: z.ZodDate;
    sshHostId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    notBefore: Date;
    notAfter: Date;
    serialNumber: string;
    certType: string;
    principals: string[];
    keyId: string;
    sshCaId?: string | null | undefined;
    sshCertificateTemplateId?: string | null | undefined;
    sshHostId?: string | null | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    notBefore: Date;
    notAfter: Date;
    serialNumber: string;
    certType: string;
    principals: string[];
    keyId: string;
    sshCaId?: string | null | undefined;
    sshCertificateTemplateId?: string | null | undefined;
    sshHostId?: string | null | undefined;
}>;
export type TSshCertificates = z.infer<typeof SshCertificatesSchema>;
export type TSshCertificatesInsert = Omit<z.input<typeof SshCertificatesSchema>, TImmutableDBKeys>;
export type TSshCertificatesUpdate = Partial<Omit<z.input<typeof SshCertificatesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-certificates.d.ts.map