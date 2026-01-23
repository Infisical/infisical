import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const SshCertificateAuthoritiesSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    status: z.ZodString;
    friendlyName: z.ZodString;
    keyAlgorithm: z.ZodString;
    keySource: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    projectId: string;
    keyAlgorithm: string;
    friendlyName: string;
    keySource: string;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    projectId: string;
    keyAlgorithm: string;
    friendlyName: string;
    keySource: string;
}>;
export type TSshCertificateAuthorities = z.infer<typeof SshCertificateAuthoritiesSchema>;
export type TSshCertificateAuthoritiesInsert = Omit<z.input<typeof SshCertificateAuthoritiesSchema>, TImmutableDBKeys>;
export type TSshCertificateAuthoritiesUpdate = Partial<Omit<z.input<typeof SshCertificateAuthoritiesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=ssh-certificate-authorities.d.ts.map