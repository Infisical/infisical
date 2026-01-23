import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const CertificateAuthoritiesSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    projectId: z.ZodString;
    status: z.ZodString;
    enableDirectIssuance: z.ZodDefault<z.ZodBoolean>;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    name: string;
    projectId: string;
    enableDirectIssuance: boolean;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    name: string;
    projectId: string;
    enableDirectIssuance?: boolean | undefined;
}>;
export type TCertificateAuthorities = z.infer<typeof CertificateAuthoritiesSchema>;
export type TCertificateAuthoritiesInsert = Omit<z.input<typeof CertificateAuthoritiesSchema>, TImmutableDBKeys>;
export type TCertificateAuthoritiesUpdate = Partial<Omit<z.input<typeof CertificateAuthoritiesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=certificate-authorities.d.ts.map