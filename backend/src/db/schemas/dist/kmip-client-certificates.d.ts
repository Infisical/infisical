import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const KmipClientCertificatesSchema: z.ZodObject<{
    id: z.ZodString;
    kmipClientId: z.ZodString;
    serialNumber: z.ZodString;
    keyAlgorithm: z.ZodString;
    issuedAt: z.ZodDate;
    expiration: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    keyAlgorithm: string;
    serialNumber: string;
    issuedAt: Date;
    expiration: Date;
    kmipClientId: string;
}, {
    id: string;
    keyAlgorithm: string;
    serialNumber: string;
    issuedAt: Date;
    expiration: Date;
    kmipClientId: string;
}>;
export type TKmipClientCertificates = z.infer<typeof KmipClientCertificatesSchema>;
export type TKmipClientCertificatesInsert = Omit<z.input<typeof KmipClientCertificatesSchema>, TImmutableDBKeys>;
export type TKmipClientCertificatesUpdate = Partial<Omit<z.input<typeof KmipClientCertificatesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=kmip-client-certificates.d.ts.map