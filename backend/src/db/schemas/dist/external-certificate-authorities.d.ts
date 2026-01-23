/// <reference types="node" />
/// <reference types="node" />
import { z } from "zod";
import { TImmutableDBKeys } from "./models";
export declare const ExternalCertificateAuthoritiesSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    appConnectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    dnsAppConnectionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    caId: z.ZodString;
    credentials: z.ZodOptional<z.ZodNullable<z.ZodType<Buffer, z.ZodTypeDef, Buffer>>>;
    configuration: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: string;
    caId: string;
    appConnectionId?: string | null | undefined;
    dnsAppConnectionId?: string | null | undefined;
    credentials?: Buffer | null | undefined;
    configuration?: unknown;
}, {
    id: string;
    type: string;
    caId: string;
    appConnectionId?: string | null | undefined;
    dnsAppConnectionId?: string | null | undefined;
    credentials?: Buffer | null | undefined;
    configuration?: unknown;
}>;
export type TExternalCertificateAuthorities = z.infer<typeof ExternalCertificateAuthoritiesSchema>;
export type TExternalCertificateAuthoritiesInsert = Omit<z.input<typeof ExternalCertificateAuthoritiesSchema>, TImmutableDBKeys>;
export type TExternalCertificateAuthoritiesUpdate = Partial<Omit<z.input<typeof ExternalCertificateAuthoritiesSchema>, TImmutableDBKeys>>;
//# sourceMappingURL=external-certificate-authorities.d.ts.map