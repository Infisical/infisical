import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshCertificateTemplatesSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    sshCaId: z.ZodString;
    status: z.ZodString;
    name: z.ZodString;
    ttl: z.ZodString;
    maxTTL: z.ZodString;
    allowedUsers: z.ZodArray<z.ZodString, "many">;
    allowedHosts: z.ZodArray<z.ZodString, "many">;
    allowUserCertificates: z.ZodBoolean;
    allowHostCertificates: z.ZodBoolean;
    allowCustomKeyIds: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    name: string;
    ttl: string;
    maxTTL: string;
    sshCaId: string;
    allowedUsers: string[];
    allowedHosts: string[];
    allowUserCertificates: boolean;
    allowHostCertificates: boolean;
    allowCustomKeyIds: boolean;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    name: string;
    ttl: string;
    maxTTL: string;
    sshCaId: string;
    allowedUsers: string[];
    allowedHosts: string[];
    allowUserCertificates: boolean;
    allowHostCertificates: boolean;
    allowCustomKeyIds: boolean;
}>;
export type TSshCertificateTemplates = z.infer<typeof SshCertificateTemplatesSchema>;
export type TSshCertificateTemplatesInsert = Omit<z.input<typeof SshCertificateTemplatesSchema>, TImmutableDBKeys>;
export type TSshCertificateTemplatesUpdate = Partial<Omit<z.input<typeof SshCertificateTemplatesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-certificate-templates.d.ts.map